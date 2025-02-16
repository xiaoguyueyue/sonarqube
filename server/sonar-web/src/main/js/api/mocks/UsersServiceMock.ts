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
import { mockClusterSysInfo, mockIdentityProvider, mockUser } from '../../helpers/testMocks';
import { IdentityProvider, Paging, SysInfoCluster } from '../../types/types';
import { User } from '../../types/users';
import { getSystemInfo } from '../system';
import { getIdentityProviders, searchUsers } from '../users';

export default class UsersServiceMock {
  isManaged = true;
  users = [
    mockUser({
      managed: true,
      login: 'bob.marley',
      name: 'Bob Marley',
    }),
    mockUser({
      managed: false,
      login: 'alice.merveille',
      name: 'Alice Merveille',
    }),
  ];

  constructor() {
    jest.mocked(getSystemInfo).mockImplementation(this.handleGetSystemInfo);
    jest.mocked(getIdentityProviders).mockImplementation(this.handleGetIdentityProviders);
    jest.mocked(searchUsers).mockImplementation((p) => this.handleSearchUsers(p));
  }

  setIsManaged(managed: boolean) {
    this.isManaged = managed;
  }

  handleSearchUsers = (data: any): Promise<{ paging: Paging; users: User[] }> => {
    const paging = {
      pageIndex: 1,
      pageSize: 100,
      total: 0,
    };

    if (this.isManaged) {
      if (data.managed === undefined) {
        return this.reply({ paging, users: this.users });
      }
      const users = this.users.filter((user) => user.managed === data.managed);
      return this.reply({ paging, users });
    }
    return this.reply({ paging, users: this.users });
  };

  handleGetIdentityProviders = (): Promise<{ identityProviders: IdentityProvider[] }> => {
    return this.reply({ identityProviders: [mockIdentityProvider()] });
  };

  handleGetSystemInfo = (): Promise<SysInfoCluster> => {
    return this.reply(
      mockClusterSysInfo(
        this.isManaged
          ? {
              System: {
                'High Availability': true,
                'Server ID': 'asd564-asd54a-5dsfg45',
                'External Users and Groups Provisioning': 'Okta',
              },
            }
          : {}
      )
    );
  };

  reply<T>(response: T): Promise<T> {
    return Promise.resolve(cloneDeep(response));
  }
}
