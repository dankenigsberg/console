import * as React from 'react';
import * as classNames from 'classnames';
import * as _ from 'lodash-es';

import { K8sResourceKindReference } from '../../module/k8s';
import { modelFor } from '../../module/k8s/k8s-models';

export const ResourceIcon = (props: ResourceIconProps) => {
  const kindObj = modelFor(props.kind);
  const kindStr = _.get(kindObj, 'kind', props.kind);
  const klass = classNames(`co-m-resource-icon co-m-resource-${kindStr.toLowerCase()}`, props.className);
  const iconLabel = (kindObj && kindObj.abbr) || kindStr.toUpperCase().slice(0, 3);

  return <span className={klass}>{iconLabel}</span>;
};

/* eslint-disable no-undef */
export type ResourceIconProps = {
  className?: string;
  kind: K8sResourceKindReference;
};

export type ResourceNameProps = {
  kind: K8sResourceKindReference;
  name: string;
};
/* eslint-enable no-undef */

export const ResourceName: React.SFC<ResourceNameProps> = (props) => <span><ResourceIcon kind={props.kind} /> {props.name}</span>;

ResourceName.displayName = 'ResourceName';
