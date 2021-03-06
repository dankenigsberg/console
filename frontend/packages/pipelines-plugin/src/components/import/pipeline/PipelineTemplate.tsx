import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import * as _ from 'lodash';
import { LoadingInline } from '@console/internal/components/utils';
import { k8sList } from '@console/internal/module/k8s';
import { useFormikContext, FormikValues } from 'formik';
import { Alert, ExpandableSection } from '@patternfly/react-core';
import { CheckboxField } from '@console/shared';
import { NormalizedBuilderImages } from '@console/dev-console/src/utils/imagestream-utils';
import { ReadableResourcesNames } from '@console/dev-console/src/components/import/import-types';
import { CLUSTER_PIPELINE_NS, PIPELINE_RUNTIME_LABEL } from '../../../const';
import { PipelineModel } from '../../../models';
import PipelineVisualization from '../../pipelines/detail-page-tabs/pipeline-details/PipelineVisualization';
import { Pipeline } from '../../../utils/pipeline-augment';

const labelType = 'pipeline.openshift.io/type';
const labelDocker = 'pipeline.openshift.io/strategy';

const getAlertText = (
  isDockerStrategy: boolean,
  isPipelineAttached: boolean,
  builderImage: string,
  resourceType: string,
  t: TFunction,
): string => {
  const MISSING_DOCKERFILE_LABEL_TEXT = t(
    'pipelines-plugin~The pipeline template for Dockerfiles is not available at this time.',
  );
  const UNSUPPORTED_BUILDERIMAGE_TEXT = t(
    'pipelines-plugin~There are no pipeline templates available for {{builderImage}}, current pipeline will be dissociated from application.',
    { builderImage },
  );
  if (isDockerStrategy) return MISSING_DOCKERFILE_LABEL_TEXT;
  if (isPipelineAttached) return UNSUPPORTED_BUILDERIMAGE_TEXT;

  return t(
    'pipelines-plugin~There are no pipeline templates available for {{builderImage}} and {{resourceType}} combination.',
    { builderImage, resourceType },
  );
};

type PipelineTemplateProps = {
  builderImages: NormalizedBuilderImages;
  existingPipeline?: Pipeline;
};

const PipelineTemplate: React.FC<PipelineTemplateProps> = ({ builderImages, existingPipeline }) => {
  const { t } = useTranslation();
  const [noTemplateForRuntime, setNoTemplateForRuntime] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const pipelineStorageRef = React.useRef<{ [image: string]: Pipeline[] }>({});

  const {
    values: { pipeline, image, build, resources },
    setFieldValue,
  } = useFormikContext<FormikValues>();

  const isDockerStrategy = build.strategy === 'Docker';
  const isPipelineAttached = !_.isEmpty(existingPipeline);

  React.useEffect(() => {
    let ignore = false;

    const builderPipelineLabel = { [PIPELINE_RUNTIME_LABEL]: image.selected };
    const dockerPipelineLabel = { [labelDocker]: 'docker' };

    const labelSelector = isDockerStrategy ? dockerPipelineLabel : builderPipelineLabel;

    const fetchPipelineTemplate = async () => {
      let fetchedPipelines: Pipeline[] = null;
      if (!pipelineStorageRef.current[image.selected]) {
        fetchedPipelines = (await k8sList(PipelineModel, {
          ns: CLUSTER_PIPELINE_NS,
          labelSelector,
        })) as Pipeline[];
      }

      if (ignore) return;

      if (fetchedPipelines) {
        pipelineStorageRef.current[image.selected] = fetchedPipelines;
      }

      const imagePipelines: Pipeline[] = pipelineStorageRef.current[image.selected] || [];
      const resourceSpecificPipeline = imagePipelines.find(
        (pl) => pl.metadata?.labels?.[labelType] === resources,
      );
      const pipelineTemplate =
        resourceSpecificPipeline || imagePipelines.find((pl) => !pl.metadata?.labels?.[labelType]);

      if (pipelineTemplate) {
        setFieldValue('pipeline.template', pipelineTemplate);
        setNoTemplateForRuntime(false);
      } else {
        setFieldValue('pipeline.template', null);
        setNoTemplateForRuntime(true);
      }
    };

    fetchPipelineTemplate();

    return () => {
      ignore = true;
    };
  }, [resources, image.selected, isDockerStrategy, setFieldValue]);

  if (noTemplateForRuntime) {
    const builderImageTitle =
      builderImages?.[image.selected]?.title || t('pipelines-plugin~this Builder Image');
    const resourceName = ReadableResourcesNames[resources];
    return (
      <Alert
        isInline
        variant="info"
        title={getAlertText(
          isDockerStrategy,
          isPipelineAttached,
          builderImageTitle,
          resourceName,
          t,
        )}
      />
    );
  }

  const changedPipelineWarning =
    isPipelineAttached &&
    pipeline.template?.metadata?.labels[PIPELINE_RUNTIME_LABEL] !==
      existingPipeline?.metadata?.labels[PIPELINE_RUNTIME_LABEL] ? (
      <Alert
        isInline
        variant="info"
        title={t('pipelines-plugin~Pipeline will be updated to match the builder Image.')}
      />
    ) : null;

  return pipeline.template ? (
    <>
      {changedPipelineWarning}
      <CheckboxField
        label={t('pipelines-plugin~Add pipeline')}
        name="pipeline.enabled"
        isDisabled={isPipelineAttached}
      />
      <ExpandableSection
        toggleText={`${isExpanded ? t('pipelines-plugin~Hide') : t('pipelines-plugin~Show')} ${t(
          'pipelines-plugin~pipeline visualization',
        )}`}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded && <PipelineVisualization pipeline={pipeline.template} />}
      </ExpandableSection>
    </>
  ) : (
    <LoadingInline />
  );
};

export default PipelineTemplate;
