/*
 * Copyright 2021 The Backstage Authors
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
import React from 'react';
import {
  catalogApiRef,
  CatalogApi,
  EntityProvider,
  entityRouteRef,
} from '@backstage/plugin-catalog-react';
import { render } from '@testing-library/react';
import { HomePage } from './HomePage';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
// import { msw } from '@backstage/test-utils';
import { BrowserRouter as Router } from 'react-router-dom';
import { ApiProvider, ApiRegistry } from '@backstage/core-app-api';
import { Entity, EntityMeta, RELATION_PART_OF } from '@backstage/catalog-model';
import { ThemeProvider } from '@material-ui/core';
import { lightTheme } from '@backstage/theme';
import { msw, renderInTestApp } from '@backstage/test-utils';
import { costInsightsPlugin } from '@backstage/plugin-cost-insights';

describe('HomePage', () => {
  it('should render', async () => {
    const catalogApi: Partial<CatalogApi> = {
      getEntities: () => {
        const testMeta: EntityMeta = { name: 'testComponent' };
        const testEntity: Entity = {
          metadata: testMeta,
          apiVersion: '0',
          kind: 'Component',
          spec: { owner: 'blabla' },
        };
        return Promise.resolve({
          items: [testEntity] as Entity[],
        });
      },
    };

    const rendered = await renderInTestApp(
      <ApiProvider apis={ApiRegistry.from([[catalogApiRef, catalogApi]])}>
        <HomePage />
      </ApiProvider>,
    );

    expect(await rendered.findAllByText('testComponent')).toBeInTheDocument();
    // console.log(rendered);

    // console.log("should be progress element ", await rendered.findByTestId('bazaar-header'));
    // expect(await rendered.findByTestId('progress')).toBeInTheDocument();
    // console.log("före");
    // setTimeout(() => {
    //   console.log("set timeout");
    //   return "hej";
    // }, 2000);
    // console.log("efter");
  });
});
