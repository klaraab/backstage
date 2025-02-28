/*
 * Copyright 2021 Spotify AB
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
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';

type Props = {
  value: string;
  onChange: (option: string) => void;
  isFormInvalid: boolean;
  options: string[];
  label: string;
};

export const InputSelector = ({
  value,
  onChange,
  isFormInvalid,
  options,
  label,
}: Props) => {
  return (
    <FormControl fullWidth>
      <InputLabel id="demo-simple-select-outlined-label">{label}</InputLabel>
      <Select
        data-testid={`input-selector-${label}`}
        required
        labelId="demo-simple-select-outlined-label"
        id="demo-simple-select-outlined"
        value={value}
        error={isFormInvalid && value === ''}
        label="Project"
      >
        {options?.map(option => {
          return (
            <MenuItem
              data-testid="menu-item"
              button
              onClick={() => onChange(option)}
              key={option}
              value={option}
            >
              {option}
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
};
