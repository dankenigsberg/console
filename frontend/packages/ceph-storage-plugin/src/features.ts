import * as _ from 'lodash';
import { Dispatch } from 'react-redux';
import { k8sList, StorageClassResourceKind, ListKind } from '@console/internal/module/k8s';
import {
  ClusterServiceVersionModel,
  ClusterServiceVersionKind,
} from '@console/operator-lifecycle-manager';
import { setFlag } from '@console/internal/actions/features';
import { FeatureDetector } from '@console/plugin-sdk';
import { getAnnotations, getName } from '@console/shared/src/selectors/common';
import { fetchK8s } from '@console/internal/graphql/client';
import { StorageClassModel } from '@console/internal/models';
import { OCSServiceModel } from './models';
import {
  CEPH_STORAGE_NAMESPACE,
  OCS_SUPPORT_ANNOTATION,
  RGW_PROVISIONER,
  SECOND,
  OCS_OPERATOR,
} from './constants';
import { StorageClusterKind } from './types';

export const OCS_INDEPENDENT_FLAG = 'OCS_INDEPENDENT';
export const OCS_CONVERGED_FLAG = 'OCS_CONVERGED';

// Used to activate NooBaa dashboard
export const OCS_FLAG = 'OCS';
// Todo(bipuladh): Remove this completely in 4.6
export const CEPH_FLAG = 'CEPH';

export const LSO_FLAG = 'LSO';

export const RGW_FLAG = 'RGW';

/* Key should be same as values received from the CSV 
  Values should be formatted as OCS_<Console-Flag-Name> */
export const OCS_SUPPORT_FLAGS = {
  MULTUS: 'OCS_MULTUS',
};

const handleError = (res: any, flags: string[], dispatch: Dispatch, cb: FeatureDetector) => {
  const status = res?.response?.status;
  if (_.includes([403, 502], status)) {
    flags.forEach((feature) => {
      dispatch(setFlag(feature, undefined));
    });
  }
  if (!_.includes([401, 403, 500], status)) {
    setTimeout(() => cb(dispatch), 15000);
  }
};

export const detectRGW: FeatureDetector = async (dispatch) => {
  let id = null;
  const logicHandler = () =>
    k8sList(StorageClassModel)
      .then((data: StorageClassResourceKind[]) => {
        const isRGWPresent = data.some((sc) => sc.provisioner === RGW_PROVISIONER);
        if (isRGWPresent) {
          dispatch(setFlag(RGW_FLAG, true));
          clearInterval(id);
        } else {
          dispatch(setFlag(RGW_FLAG, false));
        }
      })
      .catch(() => {
        clearInterval(id);
      });
  id = setInterval(logicHandler, 10 * SECOND);
};

export const detectOCS: FeatureDetector = async (dispatch) => {
  try {
    const storageClusters = await k8sList(OCSServiceModel, { ns: CEPH_STORAGE_NAMESPACE });
    const storageCluster = storageClusters.find(
      (sc: StorageClusterKind) => sc.status.phase !== 'Ignored',
    );
    const isInternal = _.isEmpty(storageCluster.spec.externalStorage);
    dispatch(setFlag(OCS_FLAG, true));
    dispatch(setFlag(OCS_CONVERGED_FLAG, isInternal));
    dispatch(setFlag(OCS_INDEPENDENT_FLAG, !isInternal));
  } catch (e) {
    if (e?.response?.status !== 404)
      handleError(e, [OCS_CONVERGED_FLAG, OCS_INDEPENDENT_FLAG], dispatch, detectOCS);
    else {
      dispatch(setFlag(OCS_CONVERGED_FLAG, false));
      dispatch(setFlag(OCS_INDEPENDENT_FLAG, false));
    }
  }
};

export const detectOCSSupportedFeatures: FeatureDetector = async (dispatch) => {
  try {
    const csvList = await fetchK8s<ListKind<ClusterServiceVersionKind>>(
      ClusterServiceVersionModel,
      '',
      CEPH_STORAGE_NAMESPACE,
    );
    const ocsCSV = csvList.items.find((obj) => _.startsWith(getName(obj), OCS_OPERATOR));

    const support = JSON.parse(getAnnotations(ocsCSV)[OCS_SUPPORT_ANNOTATION]);
    _.keys(OCS_SUPPORT_FLAGS).forEach((feature) => {
      dispatch(setFlag(OCS_SUPPORT_FLAGS[feature], support.includes(feature.toLowerCase())));
    });
  } catch (error) {
    error?.response?.status === 404
      ? _.keys(OCS_SUPPORT_FLAGS).forEach((feature) => {
          dispatch(setFlag(OCS_SUPPORT_FLAGS[feature], false));
        })
      : handleError(error, _.keys(OCS_SUPPORT_FLAGS), dispatch, detectOCSSupportedFeatures);
  }
};
