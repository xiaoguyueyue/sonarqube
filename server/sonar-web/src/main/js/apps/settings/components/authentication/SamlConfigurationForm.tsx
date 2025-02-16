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
import { isEmpty, keyBy } from 'lodash';
import * as React from 'react';
import { FormattedMessage } from 'react-intl';
import { setSettingValue } from '../../../../api/settings';
import DocLink from '../../../../components/common/DocLink';
import { ResetButtonLink, SubmitButton } from '../../../../components/controls/buttons';
import Modal from '../../../../components/controls/Modal';
import { Alert } from '../../../../components/ui/Alert';
import DeferredSpinner from '../../../../components/ui/DeferredSpinner';
import { translate } from '../../../../helpers/l10n';
import { Dict } from '../../../../types/types';
import {
  SamlSettingValue,
  SAML_ENABLED_FIELD,
  SAML_GROUP_NAME,
  SAML_SCIM_DEPRECATED,
} from './hook/useLoadSamlSettings';
import SamlFormField from './SamlFormField';

interface Props {
  create: boolean;
  loading: boolean;
  values: Dict<SamlSettingValue>;
  setNewValue: (key: string, value: string | boolean) => void;
  canBeSave: boolean;
  onClose: () => void;
  onReload: () => Promise<void>;
}

interface ErrorValue {
  key: string;
  message: string;
}

export const SAML = 'saml';

const SAML_EXCLUDED_FIELD = [SAML_ENABLED_FIELD, SAML_GROUP_NAME, SAML_SCIM_DEPRECATED];

export default function SamlConfigurationForm(props: Props) {
  const { create, loading, values, setNewValue, canBeSave } = props;
  const [errors, setErrors] = React.useState<Dict<ErrorValue>>({});

  const headerLabel = translate('settings.authentication.saml.form', create ? 'create' : 'edit');

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (canBeSave) {
      const r = await Promise.all(
        Object.values(values)
          .filter((v) => v.newValue !== undefined)
          .map(async ({ key, newValue, definition }) => {
            try {
              await setSettingValue(definition, newValue);
              return { key, success: true };
            } catch (error) {
              return { key, success: false };
            }
          })
      );
      const errors = r
        .filter(({ success }) => !success)
        .map(({ key }) => ({ key, message: translate('default_save_field_error_message') }));
      setErrors(keyBy(errors, 'key'));
      if (isEmpty(errors)) {
        await props.onReload();
        props.onClose();
      }
    } else {
      const errors = Object.values(values)
        .filter((v) => v.newValue === undefined && v.value === undefined && v.mandatory)
        .map((v) => ({ key: v.key, message: translate('field_required') }));
      setErrors(keyBy(errors, 'key'));
    }
  };

  return (
    <Modal contentLabel={headerLabel} shouldCloseOnOverlayClick={false} size="medium">
      <form className="views-form create-saml-form" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h2>{headerLabel}</h2>
        </div>
        <div className="modal-body modal-container">
          <DeferredSpinner
            loading={loading}
            ariaLabel={translate('settings.authentication.saml.form.loading')}
          >
            <Alert variant="info">
              <FormattedMessage
                id="settings.authentication.help"
                defaultMessage={translate('settings.authentication.help')}
                values={{
                  link: (
                    <DocLink to="/instance-administration/authentication/saml/overview/">
                      {translate('settings.authentication.help.link')}
                    </DocLink>
                  ),
                }}
              />
            </Alert>
            {Object.values(values).map((val) => {
              if (SAML_EXCLUDED_FIELD.includes(val.key)) {
                return null;
              }
              return (
                <div key={val.key}>
                  <SamlFormField
                    settingValue={values[val.key]?.newValue ?? values[val.key]?.value}
                    definition={val.definition}
                    mandatory={val.mandatory}
                    onFieldChange={setNewValue}
                    isNotSet={val.isNotSet}
                    error={errors[val.key]?.message}
                  />
                </div>
              );
            })}
          </DeferredSpinner>
        </div>

        <div className="modal-foot">
          <SubmitButton disabled={!canBeSave}>
            {translate('settings.almintegration.form.save')}
            <DeferredSpinner className="spacer-left" loading={loading} />
          </SubmitButton>
          <ResetButtonLink onClick={props.onClose}>{translate('cancel')}</ResetButtonLink>
        </div>
      </form>
    </Modal>
  );
}
