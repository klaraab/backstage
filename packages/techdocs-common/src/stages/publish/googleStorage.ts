/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  Entity,
  EntityName,
  ENTITY_DEFAULT_NAMESPACE,
} from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { File, FileExistsResponse, Storage } from '@google-cloud/storage';
import express from 'express';
import JSON5 from 'json5';
import path from 'path';
import { Readable } from 'stream';
import { Logger } from 'winston';
import {
  getFileTreeRecursively,
  getHeadersForFileExtension,
  lowerCaseEntityTriplet,
  lowerCaseEntityTripletInStoragePath,
  bulkStorageOperation,
  getCloudPathForLocalPath,
  getStaleFiles,
} from './helpers';
import { MigrateWriteStream } from './migrations';
import {
  PublisherBase,
  PublishRequest,
  ReadinessResponse,
  TechDocsMetadata,
} from './types';

export class GoogleGCSPublish implements PublisherBase {
  static fromConfig(config: Config, logger: Logger): PublisherBase {
    let bucketName = '';
    try {
      bucketName = config.getString('techdocs.publisher.googleGcs.bucketName');
    } catch (error) {
      throw new Error(
        "Since techdocs.publisher.type is set to 'googleGcs' in your app config, " +
          'techdocs.publisher.googleGcs.bucketName is required.',
      );
    }

    // Credentials is an optional config. If missing, default GCS environment variables will be used.
    // Read more here https://cloud.google.com/docs/authentication/production
    const credentials = config.getOptionalString(
      'techdocs.publisher.googleGcs.credentials',
    );
    let credentialsJson = {};
    if (credentials) {
      try {
        credentialsJson = JSON.parse(credentials);
      } catch (err) {
        throw new Error(
          'Error in parsing techdocs.publisher.googleGcs.credentials config to JSON.',
        );
      }
    }

    const storageClient = new Storage({
      ...(credentials && {
        credentials: credentialsJson,
      }),
    });

    const legacyPathCasing =
      config.getOptionalBoolean(
        'techdocs.legacyUseCaseSensitiveTripletPaths',
      ) || false;

    return new GoogleGCSPublish(
      storageClient,
      bucketName,
      legacyPathCasing,
      logger,
    );
  }

  constructor(
    private readonly storageClient: Storage,
    private readonly bucketName: string,
    private readonly legacyPathCasing: boolean,
    private readonly logger: Logger,
  ) {
    this.storageClient = storageClient;
    this.bucketName = bucketName;
    this.legacyPathCasing = legacyPathCasing;
    this.logger = logger;
  }

  /**
   * Check if the defined bucket exists. Being able to connect means the configuration is good
   * and the storage client will work.
   */
  async getReadiness(): Promise<ReadinessResponse> {
    try {
      await this.storageClient.bucket(this.bucketName).getMetadata();
      this.logger.info(
        `Successfully connected to the GCS bucket ${this.bucketName}.`,
      );

      return {
        isAvailable: true,
      };
    } catch (err) {
      this.logger.error(
        `Could not retrieve metadata about the GCS bucket ${this.bucketName}. ` +
          'Make sure the bucket exists. Also make sure that authentication is setup either by explicitly defining ' +
          'techdocs.publisher.googleGcs.credentials in app config or by using environment variables. ' +
          'Refer to https://backstage.io/docs/features/techdocs/using-cloud-storage',
      );
      this.logger.error(`from GCS client library: ${err.message}`);

      return { isAvailable: false };
    }
  }

  /**
   * Upload all the files from the generated `directory` to the GCS bucket.
   * Directory structure used in the bucket is - entityNamespace/entityKind/entityName/index.html
   */
  async publish({ entity, directory }: PublishRequest): Promise<void> {
    const useLegacyPathCasing = this.legacyPathCasing;
    const bucket = this.storageClient.bucket(this.bucketName);

    // First, try to retrieve a list of all individual files currently existing
    let existingFiles: string[] = [];
    try {
      const remoteFolder = getCloudPathForLocalPath(
        entity,
        undefined,
        useLegacyPathCasing,
      );
      existingFiles = await this.getFilesForFolder(remoteFolder);
    } catch (e) {
      this.logger.error(
        `Unable to list files for Entity ${entity.metadata.name}: ${e.message}`,
      );
    }

    // Then, merge new files into the same folder
    let absoluteFilesToUpload;
    try {
      // Remove the absolute path prefix of the source directory
      // Path of all files to upload, relative to the root of the source directory
      // e.g. ['index.html', 'sub-page/index.html', 'assets/images/favicon.png']
      absoluteFilesToUpload = await getFileTreeRecursively(directory);

      await bulkStorageOperation(
        async absoluteFilePath => {
          const relativeFilePath = path.relative(directory, absoluteFilePath);
          return await bucket.upload(absoluteFilePath, {
            destination: getCloudPathForLocalPath(
              entity,
              relativeFilePath,
              useLegacyPathCasing,
            ),
          });
        },
        absoluteFilesToUpload,
        { concurrencyLimit: 10 },
      );

      this.logger.info(
        `Successfully uploaded all the generated files for Entity ${entity.metadata.name}. Total number of files: ${absoluteFilesToUpload.length}`,
      );
    } catch (e) {
      const errorMessage = `Unable to upload file(s) to Google Cloud Storage. ${e}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    // Last, try to remove the files that were *only* present previously
    try {
      const relativeFilesToUpload = absoluteFilesToUpload.map(
        absoluteFilePath =>
          getCloudPathForLocalPath(
            entity,
            path.relative(directory, absoluteFilePath),
            useLegacyPathCasing,
          ),
      );
      const staleFiles = getStaleFiles(relativeFilesToUpload, existingFiles);

      await bulkStorageOperation(
        async relativeFilePath => {
          return await bucket.file(relativeFilePath).delete();
        },
        staleFiles,
        { concurrencyLimit: 10 },
      );

      this.logger.info(
        `Successfully deleted stale files for Entity ${entity.metadata.name}. Total number of files: ${staleFiles.length}`,
      );
    } catch (error) {
      const errorMessage = `Unable to delete file(s) from Google Cloud Storage. ${error}`;
      this.logger.error(errorMessage);
    }
  }

  fetchTechDocsMetadata(entityName: EntityName): Promise<TechDocsMetadata> {
    return new Promise((resolve, reject) => {
      const entityTriplet = `${entityName.namespace}/${entityName.kind}/${entityName.name}`;
      const entityRootDir = this.legacyPathCasing
        ? entityTriplet
        : lowerCaseEntityTriplet(entityTriplet);

      const fileStreamChunks: Array<any> = [];
      this.storageClient
        .bucket(this.bucketName)
        .file(`${entityRootDir}/techdocs_metadata.json`)
        .createReadStream()
        .on('error', err => {
          this.logger.error(err.message);
          reject(err);
        })
        .on('data', chunk => {
          fileStreamChunks.push(chunk);
        })
        .on('end', () => {
          const techdocsMetadataJson =
            Buffer.concat(fileStreamChunks).toString('utf-8');
          resolve(JSON5.parse(techdocsMetadataJson));
        });
    });
  }

  /**
   * Express route middleware to serve static files on a route in techdocs-backend.
   */
  docsRouter(): express.Handler {
    return (req, res) => {
      // Decode and trim the leading forward slash
      const decodedUri = decodeURI(req.path.replace(/^\//, ''));

      // filePath example - /default/component/documented-component/index.html
      const filePath = this.legacyPathCasing
        ? decodedUri
        : lowerCaseEntityTripletInStoragePath(decodedUri);

      // Files with different extensions (CSS, HTML) need to be served with different headers
      const fileExtension = path.extname(filePath);
      const responseHeaders = getHeadersForFileExtension(fileExtension);

      // Pipe file chunks directly from storage to client.
      this.storageClient
        .bucket(this.bucketName)
        .file(filePath)
        .createReadStream()
        .on('pipe', () => {
          res.writeHead(200, responseHeaders);
        })
        .on('error', err => {
          this.logger.warn(err.message);
          // Send a 404 with a meaningful message if possible.
          if (!res.headersSent) {
            res.status(404).send(err.message);
          } else {
            res.destroy();
          }
        })
        .pipe(res);
    };
  }

  /**
   * A helper function which checks if index.html of an Entity's docs site is available. This
   * can be used to verify if there are any pre-generated docs available to serve.
   */
  async hasDocsBeenGenerated(entity: Entity): Promise<boolean> {
    return new Promise(resolve => {
      const entityTriplet = `${entity.metadata.namespace}/${entity.kind}/${entity.metadata.name}`;
      const entityRootDir = this.legacyPathCasing
        ? entityTriplet
        : lowerCaseEntityTriplet(entityTriplet);

      this.storageClient
        .bucket(this.bucketName)
        .file(`${entityRootDir}/index.html`)
        .exists()
        .then((response: FileExistsResponse) => {
          resolve(response[0]);
        })
        .catch(() => {
          resolve(false);
        });
    });
  }

  migrateDocsCase({ removeOriginal = false, concurrency = 25 }): Promise<void> {
    return new Promise((resolve, reject) => {
      // Iterate through every file in the root of the publisher.
      const allFileMetadata: Readable = this.storageClient
        .bucket(this.bucketName)
        .getFilesStream();
      const migrateFiles = new MigrateWriteStream(
        this.logger,
        removeOriginal,
        concurrency,
      );
      migrateFiles.on('finish', resolve).on('error', reject);
      allFileMetadata.pipe(migrateFiles).on('error', error => {
        migrateFiles.destroy();
        reject(error);
      });
    });
  }

  private getFilesForFolder(folder: string): Promise<string[]> {
    const fileMetadataStream: Readable = this.storageClient
      .bucket(this.bucketName)
      .getFilesStream({ prefix: folder });

    return new Promise((resolve, reject) => {
      const files: string[] = [];

      fileMetadataStream.on('error', error => {
        // push file to file array
        reject(error);
      });

      fileMetadataStream.on('data', (file: File) => {
        // push file to file array
        files.push(file.name);
      });

      fileMetadataStream.on('end', () => {
        // resolve promise
        resolve(files);
      });
    });
  }
}
