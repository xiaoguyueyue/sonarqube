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
import * as React from 'react';
import { Helmet } from 'react-helmet-async';
import { getSystemInfo } from '../../api/system';
import { getIdentityProviders, searchUsers } from '../../api/users';
import withCurrentUserContext from '../../app/components/current-user/withCurrentUserContext';
import ButtonToggle from '../../components/controls/ButtonToggle';
import ListFooter from '../../components/controls/ListFooter';
import SearchBox from '../../components/controls/SearchBox';
import Suggestions from '../../components/embed-docs-modal/Suggestions';
import { Location, Router, withRouter } from '../../components/hoc/withRouter';
import { translate } from '../../helpers/l10n';
import { IdentityProvider, Paging, SysInfoCluster } from '../../types/types';
import { CurrentUser, User } from '../../types/users';
import Header from './Header';
import UsersList from './UsersList';
import { parseQuery, Query, serializeQuery } from './utils';

interface Props {
  currentUser: CurrentUser;
  location: Location;
  router: Router;
}

interface State {
  identityProviders: IdentityProvider[];
  manageProvider?: string;
  loading: boolean;
  paging?: Paging;
  users: User[];
}

export class UsersApp extends React.PureComponent<Props, State> {
  mounted = false;
  state: State = { identityProviders: [], loading: true, users: [] };

  componentDidMount() {
    this.mounted = true;
    this.fetchIdentityProviders();
    this.fetchManageInstance();
    this.fetchUsers();
  }

  componentDidUpdate(prevProps: Props) {
    if (
      prevProps.location.query.search !== this.props.location.query.search ||
      prevProps.location.query.managed !== this.props.location.query.managed
    ) {
      this.fetchUsers();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
  }

  finishLoading = () => {
    if (this.mounted) {
      this.setState({ loading: false });
    }
  };

  async fetchManageInstance() {
    const info = (await getSystemInfo()) as SysInfoCluster;
    if (this.mounted) {
      this.setState({
        manageProvider: info.System['External Users and Groups Provisioning'],
      });
    }
  }

  fetchIdentityProviders = () =>
    getIdentityProviders().then(({ identityProviders }) => {
      if (this.mounted) {
        this.setState({ identityProviders });
      }
    });

  fetchUsers = () => {
    const { search, managed } = parseQuery(this.props.location.query);
    this.setState({ loading: true });
    searchUsers({
      q: search,
      managed,
    }).then(({ paging, users }) => {
      if (this.mounted) {
        this.setState({ loading: false, paging, users });
      }
    }, this.finishLoading);
  };

  fetchMoreUsers = () => {
    const { paging } = this.state;
    if (paging) {
      const { search, managed } = parseQuery(this.props.location.query);
      this.setState({ loading: true });
      searchUsers({
        p: paging.pageIndex + 1,
        q: search,
        managed,
      }).then(({ paging, users }) => {
        if (this.mounted) {
          this.setState((state) => ({ loading: false, users: [...state.users, ...users], paging }));
        }
      }, this.finishLoading);
    }
  };

  updateQuery = (newQuery: Partial<Query>) => {
    const query = serializeQuery({ ...parseQuery(this.props.location.query), ...newQuery });
    this.props.router.push({ ...this.props.location, query });
  };

  updateTokensCount = (login: string, tokensCount: number) => {
    this.setState((state) => ({
      users: state.users.map((user) => (user.login === login ? { ...user, tokensCount } : user)),
    }));
  };

  render() {
    const { search, managed } = parseQuery(this.props.location.query);
    const { loading, paging, users, manageProvider } = this.state;

    return (
      <main className="page page-limited" id="users-page">
        <Suggestions suggestions="users" />
        <Helmet defer={false} title={translate('users.page')} />
        <Header onUpdateUsers={this.fetchUsers} manageProvider={manageProvider} />
        <div className="display-flex-justify-start big-spacer-bottom big-spacer-top">
          {manageProvider !== undefined && (
            <div className="big-spacer-right">
              <ButtonToggle
                value={managed === undefined ? 'all' : managed}
                disabled={loading}
                options={[
                  { label: translate('all'), value: 'all' },
                  { label: translate('managed'), value: true },
                  { label: translate('local'), value: false },
                ]}
                onCheck={(filterOption) => {
                  if (filterOption === 'all') {
                    this.updateQuery({ managed: undefined });
                  } else {
                    this.updateQuery({ managed: filterOption as boolean });
                  }
                }}
              />
            </div>
          )}
          <SearchBox
            id="users-search"
            onChange={(search: string) => this.updateQuery({ search })}
            placeholder={translate('search.search_by_login_or_name')}
            value={search}
          />
        </div>
        <UsersList
          currentUser={this.props.currentUser}
          identityProviders={this.state.identityProviders}
          onUpdateUsers={this.fetchUsers}
          updateTokensCount={this.updateTokensCount}
          users={users}
          manageProvider={manageProvider}
        />
        {paging !== undefined && (
          <ListFooter
            count={users.length}
            loadMore={this.fetchMoreUsers}
            ready={!loading}
            total={paging.total}
          />
        )}
      </main>
    );
  }
}

export default withRouter(withCurrentUserContext(UsersApp));
