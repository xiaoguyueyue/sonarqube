/*
 * SonarQube
 * Copyright (C) 2009-2023 SonarSource SA
 * mailto:info AT sonarsource DOT com
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
import { cloneDeep } from 'lodash';
import { mockSettingValue } from '../../helpers/mocks/settings';
import { BranchParameters } from '../../types/branch-like';
import { SettingDefinition, SettingValue } from '../../types/settings';
import {
  activateScim,
  deactivateScim,
  fetchIsScimEnabled,
  getValues,
  resetSettingValue,
  setSettingValue,
} from '../settings';

export default class AuthenticationServiceMock {
  settingValues: SettingValue[];
  scimStatus: boolean;
  defaulSettingValues: SettingValue[] = [
    mockSettingValue({ key: 'test1', value: '' }),
    mockSettingValue({ key: 'test2', value: 'test2' }),
    {
      key: 'sonar.auth.saml.signature.enabled',
      value: 'false',
      inherited: true,
    },
    {
      key: 'sonar.auth.saml.enabled',
      value: 'false',
      inherited: true,
    },
    {
      key: 'sonar.auth.saml.applicationId',
      value: 'sonarqube',
      inherited: true,
    },
    {
      key: 'sonar.auth.saml.providerName',
      value: 'SAML',
      inherited: true,
    },
  ];

  constructor() {
    this.settingValues = cloneDeep(this.defaulSettingValues);
    this.scimStatus = false;
    jest.mocked(getValues).mockImplementation(this.handleGetValues);
    jest.mocked(setSettingValue).mockImplementation(this.handleSetValue);
    jest.mocked(resetSettingValue).mockImplementation(this.handleResetValue);
    jest.mocked(activateScim).mockImplementation(this.handleActivateScim);
    jest.mocked(deactivateScim).mockImplementation(this.handleDeactivateScim);

    jest.mocked(fetchIsScimEnabled).mockImplementation(this.handleFetchIsScimEnabled);
  }

  handleActivateScim = () => {
    this.scimStatus = true;
    return Promise.resolve();
  };

  handleDeactivateScim = () => {
    this.scimStatus = false;
    return Promise.resolve();
  };

  handleFetchIsScimEnabled = () => {
    return Promise.resolve(this.scimStatus);
  };

  handleGetValues = (
    data: { keys: string[]; component?: string } & BranchParameters
  ): Promise<SettingValue[]> => {
    if (data.keys.length > 1) {
      return Promise.resolve(this.settingValues.filter((set) => data.keys.includes(set.key)));
    }
    return Promise.resolve(this.settingValues);
  };

  handleSetValue = (definition: SettingDefinition, value: string | boolean) => {
    if (value === 'error') {
      const res = new Response('', {
        status: 400,
        statusText: 'fail',
      });

      return Promise.reject(res);
    }
    const updatedSettingValue = this.settingValues.find((set) => set.key === definition.key);
    if (updatedSettingValue) {
      updatedSettingValue.value = String(value);
    } else {
      this.settingValues.push({ key: definition.key, value: String(value), inherited: false });
    }
    return Promise.resolve();
  };

  handleResetValue = (data: { keys: string; component?: string } & BranchParameters) => {
    if (data.keys) {
      this.settingValues.forEach((set) => {
        if (data.keys.includes(set.key)) {
          set.value = '';
        }
        return set;
      });
    }
    return Promise.resolve();
  };

  resetValues = () => {
    this.settingValues = cloneDeep(this.defaulSettingValues);
  };
}
