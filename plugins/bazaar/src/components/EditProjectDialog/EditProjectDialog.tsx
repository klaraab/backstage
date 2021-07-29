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

import React, { useState, useRef } from 'react';
import {
  createStyles,
  Theme,
  withStyles,
  WithStyles,
} from '@material-ui/core/styles';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import MuiDialogTitle from '@material-ui/core/DialogTitle';
import MuiDialogContent from '@material-ui/core/DialogContent';
import MuiDialogActions from '@material-ui/core/DialogActions';
import IconButton from '@material-ui/core/IconButton';
import CloseIcon from '@material-ui/icons/Close';
import Typography from '@material-ui/core/Typography';
import { Entity } from '@backstage/catalog-model';
import { useApi, githubAuthApiRef } from '@backstage/core-plugin-api';
import { useAsync } from 'react-use';
import { InputField } from '../InputField';
import { InputMultiSelector } from '../InputMultiSelector';
import { createPullRequest, getBranches } from '../../util/githubUtils';
import { editBazaarProperties } from '../../util/editBazaarProperties';
import { InputSelector } from '../InputSelector';

const styles = (theme: Theme) =>
  createStyles({
    root: {
      margin: 0,
      padding: theme.spacing(2),
    },
    closeButton: {
      position: 'absolute',
      right: theme.spacing(1),
      top: theme.spacing(1),
      color: theme.palette.grey[500],
    },
    formControl: {
      margin: theme.spacing(1),
      minWidth: 120,
    },
  });

export interface DialogTitleProps extends WithStyles<typeof styles> {
  id: string;
  children: React.ReactNode;
  onClose: () => void;
}

const DialogTitle = withStyles(styles)((props: DialogTitleProps) => {
  const { children, classes, onClose, ...other } = props;
  return (
    <MuiDialogTitle disableTypography className={classes.root} {...other}>
      <Typography variant="h6">{children}</Typography>
      {onClose ? (
        <IconButton
          aria-label="close"
          className={classes.closeButton}
          onClick={onClose}
        >
          <CloseIcon />
        </IconButton>
      ) : null}
    </MuiDialogTitle>
  );
});

const DialogContent = withStyles((theme: Theme) => ({
  root: {
    padding: theme.spacing(2),
  },
}))(MuiDialogContent);

const DialogActions = withStyles((theme: Theme) => ({
  root: {
    margin: 0,
    padding: theme.spacing(1),
  },
}))(MuiDialogActions);

type Props = {
  entity?: Entity;
  openEdit: boolean;
  handleClose: any;
};

const predefinedTags = [
  'java',
  'javascript',
  'go',
  'python',
  'kubernetes',
  'docker',
];

export const EditProjectDialog = ({ entity, openEdit, handleClose }: Props) => {
  const auth = useApi(githubAuthApiRef);

  const [bazaarDescription, setBazaarDescription] = useState(
    entity.metadata?.bazaar?.bazaar_description,
  );

  const [status, setStatus] = useState(entity?.metadata?.bazaar?.status);

  const { value } = useAsync(async (): Promise<any[]> => {
    return await getBranches(auth, entity);
  }, []);

  const branch = useRef(value?.[0] ? value[0].name : '');
  const [, setBranchState] = useState(branch.current);
  const [title, setTitle] = useState('Edit project');
  const [commitMessage, setCommitMessage] = useState(
    'update catalog-info.yaml',
  );
  const isInvalid = useRef(false);
  const [isFormInvalid, setIsFormInvalid] = useState(false);
  const [tags, setTags] = useState<string[]>(
    entity.metadata?.tags
      ? entity.metadata?.tags?.filter(tag => tag !== 'bazaar')
      : [],
  );

  const handleBazaarDescription = event => {
    setBazaarDescription(event.target.value);
  };

  const handleTitleChange = event => {
    setTitle(event.target.value);
  };

  const handleCommitMessageChange = event => {
    setCommitMessage(event.target.value);
  };

  const handleStatusChange = event => {
    setStatus(event);
  };

  const handleTagChange = (event, values) => {
    setTags(values);
  };

  const handleBranchChange = (branchName: string) => {
    branch.current = branchName;
    setBranchState(branchName);
  };

  const clearForm = () => {
    setBazaarDescription(entity.metadata?.bazaar?.bazaar_description);
    setStatus(entity.metadata?.bazaar?.status);
    setTags(
      entity.metadata?.tags
        ? entity.metadata?.tags?.filter((tag: string) => tag !== 'bazaar')
        : [],
    );
    setTitle('Edit project');
    setCommitMessage('update catalog-info.yaml');
    setIsFormInvalid(false);
    isInvalid.current = false;
    setBranchState('');
  };

  const handleCloseAndClear = () => {
    handleClose();
    clearForm();
  };

  const validate = () => {
    if (
      commitMessage === '' ||
      title === '' ||
      bazaarDescription === '' ||
      status === '' ||
      branch.current === ''
    ) {
      isInvalid.current = true;
      setIsFormInvalid(true);
    } else {
      isInvalid.current = false;
      setIsFormInvalid(false);
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    validate();

    if (!isInvalid.current) {
      const clonedEntity = editBazaarProperties(
        entity,
        bazaarDescription,
        tags,
        status,
      );

      await createPullRequest(
        auth,
        title,
        commitMessage,
        branch.current,
        clonedEntity,
      );
      handleCloseAndClear();
    }
  };

  return (
    <Dialog
      fullWidth
      maxWidth="xs"
      onClose={handleCloseAndClear}
      aria-labelledby="customized-dialog-title"
      open={openEdit}
    >
      <DialogTitle id="customized-dialog-title" onClose={handleCloseAndClear}>
        Edit project
      </DialogTitle>

      <DialogContent dividers>
        <InputField
          value={bazaarDescription}
          onChange={handleBazaarDescription}
          isFormInvalid={isFormInvalid}
          inputType="Bazaar description"
        />

        <InputSelector
          options={['proposed', 'ongoing']}
          value={status}
          onChange={handleStatusChange}
          isFormInvalid={isFormInvalid}
          label="Status"
        />

        <InputMultiSelector
          value={tags}
          onChange={handleTagChange}
          options={predefinedTags}
          label="Tags"
        />

        <InputField
          value={title}
          onChange={handleTitleChange}
          isFormInvalid={isFormInvalid}
          inputType="pull request title"
        />

        <InputSelector
          options={value?.map((b: any) => b.name) || []}
          value={branch.current}
          onChange={handleBranchChange}
          isFormInvalid={isFormInvalid}
          label="Branch"
        />

        <InputField
          value={commitMessage}
          onChange={handleCommitMessageChange}
          isFormInvalid={isFormInvalid}
          inputType="commit message"
        />
      </DialogContent>

      <DialogActions>
        <Button onClick={clearForm} color="primary">
          Clear
        </Button>
        <Button onClick={handleSubmit} color="primary" type="submit">
          Create pull request
        </Button>
      </DialogActions>
    </Dialog>
  );
};
