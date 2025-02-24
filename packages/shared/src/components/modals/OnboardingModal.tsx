import React, {
  KeyboardEvent,
  MouseEvent,
  ReactElement,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import ThemeOnboarding from '../onboarding/ThemeOnboarding';
import FilterOnboarding from '../onboarding/FilterOnboarding';
import LayoutOnboarding from '../onboarding/LayoutOnboarding';
import IntroductionOnboarding from '../onboarding/IntroductionOnboarding';
import FeaturesContext from '../../contexts/FeaturesContext';
import { OnboardingStep } from '../onboarding/common';
import { AnalyticsEvent, LoginTrigger, TargetType } from '../../lib/analytics';
import AnalyticsContext from '../../contexts/AnalyticsContext';
import { OnboardingMode } from '../../graphql/feed';
import { Modal, ModalProps } from './common/Modal';
import useAuthForms from '../../hooks/useAuthForms';
import AuthOptions, { AuthDisplay } from '../auth/AuthOptions';
import { AuthEventNames } from '../../lib/auth';
import CloseButton from '../CloseButton';
import { ExperimentWinner } from '../../lib/featureValues';
import { PromptOptions, usePrompt } from '../../hooks/usePrompt';

interface OnboardingModalProps extends ModalProps {
  mode?: OnboardingMode;
  onRegistrationSuccess?: () => void;
  shouldSkipIntro?: boolean;
}

interface OnboardingStepItem {
  key: OnboardingStep;
}

const promptOptions: PromptOptions = {
  title: 'Quit personalization?',
  description:
    'You will lose any personalization preferences you have chosen if you quit. Continue to personalize your feed?',
  okButton: {
    title: 'Quit',
  },
  cancelButton: {
    title: 'Continue',
  },
  className: {
    cancel: 'btn-secondary',
    ok: 'btn-primary-ketchup',
  },
};

function OnboardingModal({
  onRegistrationSuccess,
  onRequestClose,
  mode = OnboardingMode.Manual,
  shouldSkipIntro = false,
  ...props
}: OnboardingModalProps): ReactElement {
  const { trackEvent } = useContext(AnalyticsContext);
  const { showPrompt } = usePrompt();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { onboardingSteps, onboardingMinimumTopics } =
    useContext(FeaturesContext);
  const [currentView, setCurrentView] = useState(
    shouldSkipIntro ? onboardingSteps[0] : OnboardingStep.Intro,
  );
  const [screenValue, setScreenValue] = useState<AuthDisplay>(
    AuthDisplay.Default,
  );

  const onCloseConfirm = (e: MouseEvent | KeyboardEvent) => {
    if (isAuthenticating) {
      trackEvent({
        event_name: AuthEventNames.CloseSignUp,
        extra: JSON.stringify({
          trigger: LoginTrigger.CreateFeedFilters,
          screenValue,
        }),
      });
    }

    if (mode === OnboardingMode.Auto) {
      trackEvent({
        event_name: AnalyticsEvent.OnboardingSkip,
        extra: JSON.stringify({ screen_value: currentView }),
      });
    }

    onRequestClose(e);
  };

  const onClose = (e: MouseEvent | KeyboardEvent, forceClose?: boolean) => {
    if (forceClose) {
      return onRequestClose(e);
    }
    return showPrompt(promptOptions).then((result) => {
      if (result) {
        onCloseConfirm(e);
      }
    });
  };

  const { onContainerChange, formRef } = useAuthForms({ onDiscard: onClose });

  const components: Record<OnboardingStep, ReactNode> = {
    intro: null,
    topics: <FilterOnboarding key={OnboardingStep.Topics} />,
    layout: <LayoutOnboarding key={OnboardingStep.Layout} />,
    theme: <ThemeOnboarding key={OnboardingStep.Theme} />,
  };

  useEffect(() => {
    trackEvent({
      event_name: AnalyticsEvent.Impression,
      target_type: TargetType.MyFeedModal,
      target_id: ExperimentWinner.OnboardingVersion,
      extra: JSON.stringify({
        origin: mode,
        steps: onboardingSteps,
        mandating_categories: onboardingMinimumTopics,
      }),
    });
    // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = useMemo(() => {
    const items: OnboardingStepItem[] = [];

    if (!shouldSkipIntro) {
      items.push({
        key: OnboardingStep.Intro,
      });
    }

    onboardingSteps.forEach((onboardingStep) => {
      items.push({
        key: onboardingStep,
      });
    });

    return items;
  }, [onboardingSteps, shouldSkipIntro]);

  const onViewChange = (view: OnboardingStep) => {
    if (!view) {
      setIsAuthenticating(true);
    }

    setCurrentView(view);
  };

  const content = (() => {
    if (isAuthenticating) {
      return (
        <>
          <CloseButton
            className="top-2 right-2 z-2"
            style={{ position: 'absolute' }}
            onClick={onClose}
          />
          <AuthOptions
            className="h-full"
            onClose={onClose}
            formRef={formRef}
            onSuccessfulLogin={onRegistrationSuccess}
            onSuccessfulRegistration={onRegistrationSuccess}
            trigger={LoginTrigger.CreateFeedFilters}
            onDisplayChange={(display: AuthDisplay) => setScreenValue(display)}
          />
        </>
      );
    }

    return (
      <>
        <IntroductionOnboarding onClose={onClose} />
        {onboardingSteps.map((onboarding) => components[onboarding])}
      </>
    );
  })();

  return (
    <>
      <Modal
        {...props}
        kind={Modal.Kind.FixedCenter}
        size={Modal.Size.Small}
        overlayRef={onContainerChange}
        steps={isAuthenticating ? null : steps}
        onViewChange={onViewChange}
        onTrackNext={AnalyticsEvent.ClickOnboardingNext}
        onTrackPrev={AnalyticsEvent.ClickOnboardingBack}
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    </>
  );
}

export default OnboardingModal;
