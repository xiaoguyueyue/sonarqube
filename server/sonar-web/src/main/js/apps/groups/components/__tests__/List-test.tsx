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
import { shallow } from 'enzyme';
import * as React from 'react';
import { mockGroup } from '../../../../helpers/testMocks';
import List from '../List';

it('should render', () => {
  expect(shallowRender()).toMatchSnapshot();
});

it('should not render "Anyone"', () => {
  expect(shallowRender(false).find('.js-anyone').exists()).toBe(false);
});

function shallowRender(showAnyone = true) {
  const groups = [
    mockGroup({ name: 'sonar-users', description: '', membersCount: 55, default: true }),
    mockGroup({ name: 'foo', description: 'foobar', membersCount: 0, default: false }),
    mockGroup({ name: 'bar', description: 'barbar', membersCount: 1, default: false }),
  ];
  return shallow(
    <List
      groups={groups}
      onDelete={jest.fn()}
      onEdit={jest.fn()}
      onEditMembers={jest.fn()}
      showAnyone={showAnyone}
      manageProvider={undefined}
    />
  );
}
