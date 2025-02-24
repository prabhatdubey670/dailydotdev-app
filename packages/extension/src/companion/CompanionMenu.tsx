import React, { ReactElement, useContext, useEffect } from 'react';
import { Button } from '@dailydotdev/shared/src/components/buttons/Button';
import UpvoteIcon from '@dailydotdev/shared/src/components/icons/Upvote';
import CommentIcon from '@dailydotdev/shared/src/components/icons/Discuss';
import MenuIcon from '@dailydotdev/shared/src/components/icons/Menu';
import ShareIcon from '@dailydotdev/shared/src/components/icons/Share';
import SimpleTooltip from '@dailydotdev/shared/src/components/tooltips/SimpleTooltip';
import BookmarkIcon from '@dailydotdev/shared/src/components/icons/Bookmark';
import Modal from 'react-modal';
import { useContextMenu } from '@dailydotdev/react-contexify';
import { isTesting } from '@dailydotdev/shared/src/lib/constants';
import { PostBootData } from '@dailydotdev/shared/src/lib/boot';
import { Origin } from '@dailydotdev/shared/src/lib/analytics';
import AuthContext from '@dailydotdev/shared/src/contexts/AuthContext';
import usePersistentContext from '@dailydotdev/shared/src/hooks/usePersistentContext';
import AnalyticsContext from '@dailydotdev/shared/src/contexts/AnalyticsContext';
import { postAnalyticsEvent } from '@dailydotdev/shared/src/lib/feed';
import { postEventName } from '@dailydotdev/shared/src/components/utilities';
import { useKeyboardNavigation } from '@dailydotdev/shared/src/hooks/useKeyboardNavigation';
import { useSharePost } from '@dailydotdev/shared/src/hooks/useSharePost';
import NewCommentModal from '@dailydotdev/shared/src/components/modals/comment/NewCommentModal';
import ShareModal from '@dailydotdev/shared/src/components/modals/ShareModal';
import { LazyModal } from '@dailydotdev/shared/src/components/modals/common/types';
import PostToSquadModal, {
  PostToSquadModalProps,
} from '@dailydotdev/shared/src/components/modals/PostToSquadModal';
import { useLazyModal } from '@dailydotdev/shared/src/hooks/useLazyModal';
import CompanionContextMenu from './CompanionContextMenu';
import '@dailydotdev/shared/src/styles/globals.css';
import { getCompanionWrapper } from './common';
import useCompanionActions from './useCompanionActions';
import { useCompanionPostComment } from './useCompanionPostComment';
import CompanionToggle from './CompanionToggle';
import { companionRequest } from './companionRequest';

if (!isTesting) {
  Modal.setAppElement('daily-companion-app');
}

type CompanionMenuProps = {
  post: PostBootData;
  companionHelper: boolean;
  setPost: (T) => void;
  companionState: boolean;
  onOptOut: () => void;
  setCompanionState: (T) => void;
  onOpenComments?: () => void;
};

export default function CompanionMenu({
  post,
  companionHelper,
  setPost,
  companionState,
  onOptOut,
  setCompanionState,
  onOpenComments,
}: CompanionMenuProps): ReactElement {
  const { modal, closeModal } = useLazyModal();
  const { trackEvent } = useContext(AnalyticsContext);
  const { user } = useContext(AuthContext);
  const [showCompanionHelper, setShowCompanionHelper] = usePersistentContext(
    'companion_helper',
    companionHelper,
  );
  const updatePost = async (update) => {
    const oldPost = post;
    setPost({
      ...post,
      ...update,
    });
    trackEvent(
      postAnalyticsEvent(postEventName(update), post, {
        extra: { origin: 'companion context menu' },
      }),
    );
    return () => setPost(oldPost);
  };
  const { sharePost, openSharePost, closeSharePost } = useSharePost(
    Origin.Companion,
  );
  const {
    bookmark,
    removeBookmark,
    upvote,
    removeUpvote,
    report,
    blockSource,
    disableCompanion,
    removeCompanionHelper,
    toggleCompanionExpanded,
  } = useCompanionActions({
    onBookmarkMutate: () => updatePost({ bookmarked: true }),
    onRemoveBookmarkMutate: () => updatePost({ bookmarked: false }),
    onUpvoteMutate: () =>
      updatePost({ upvoted: true, numUpvotes: post.numUpvotes + 1 }),
    onRemoveUpvoteMutate: () =>
      updatePost({ upvoted: false, numUpvotes: post.numUpvotes + -1 }),
  });
  const { parentComment, closeNewComment, openNewComment, onInput } =
    useCompanionPostComment(post, { onCommentSuccess: onOpenComments });

  /**
   * Use a cleanup effect to always set the local cache helper state to false on destroy
   */
  useEffect(() => {
    if (user) {
      removeCompanionHelper({});
    }
    const cleanup = () => {
      setShowCompanionHelper(false);
    };
    window.addEventListener('beforeunload', cleanup);
    return () => cleanup();
    // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCompanion = () => {
    setShowCompanionHelper(false);
    trackEvent({
      event_name: `${companionState ? 'close' : 'open'} companion`,
    });
    toggleCompanionExpanded({ companionExpandedValue: !companionState });
    setCompanionState((state) => !state);
  };

  const onShare = () => openSharePost(post);

  const optOut = () => {
    disableCompanion({});
    onOptOut();
  };

  const toggleUpvote = async () => {
    if (user) {
      if (!post.upvoted) {
        await upvote({ id: post.id });
      } else {
        await removeUpvote({ id: post.id });
      }
    } else {
      window.open(
        `${process.env.NEXT_PUBLIC_WEBAPP_URL}signup?close=true`,
        '_blank',
      );
    }
  };

  const toggleBookmark = async () => {
    if (user) {
      if (!post.bookmarked) {
        await bookmark({ id: post.id });
      } else {
        await removeBookmark({ id: post.id });
      }
    } else {
      window.open(
        `${process.env.NEXT_PUBLIC_WEBAPP_URL}signup?close=true`,
        '_blank',
      );
    }
  };

  const { show: showCompanionOptionsMenu } = useContextMenu({
    id: 'companion-options-context',
  });
  const onContextOptions = (event: React.MouseEvent): void => {
    showCompanionOptionsMenu(event, {
      position: { x: 48, y: 265 },
    });
  };

  const tooltipContainerProps = { className: 'shadow-2 whitespace-nowrap' };

  const onEscape = () => {
    if (!companionState) {
      return;
    }

    trackEvent({ event_name: 'close companion' });
    toggleCompanionExpanded({ companionExpandedValue: false });
    setCompanionState(false);
  };

  useKeyboardNavigation(window, [['Escape', onEscape]], {
    disabledModalOpened: true,
  });

  return (
    <div className="group flex relative flex-col gap-2 self-center p-2 my-6 w-14 rounded-l-16 border border-theme-divider-quaternary bg-theme-bg-primary">
      <CompanionToggle
        companionState={companionState}
        isAlertDisabled={!showCompanionHelper}
        tooltipContainerProps={tooltipContainerProps}
        onToggleCompanion={toggleCompanion}
      />
      <SimpleTooltip
        placement="left"
        content={post?.upvoted ? 'Remove upvote' : 'Upvote'}
        appendTo="parent"
        container={tooltipContainerProps}
      >
        <Button
          icon={<UpvoteIcon secondary={post?.upvoted} />}
          pressed={post?.upvoted}
          onClick={toggleUpvote}
          className="btn-tertiary-avocado"
        />
      </SimpleTooltip>
      <SimpleTooltip
        placement="left"
        content="Add comment"
        appendTo="parent"
        container={tooltipContainerProps}
      >
        <Button
          className="btn-tertiary-blueCheese"
          pressed={post?.commented}
          icon={<CommentIcon />}
          onClick={() => openNewComment('comment button')}
        />
      </SimpleTooltip>
      <SimpleTooltip
        placement="left"
        content={`${post?.bookmarked ? 'Remove from' : 'Save to'} bookmarks`}
        appendTo="parent"
        container={tooltipContainerProps}
      >
        <Button
          icon={<BookmarkIcon secondary={post?.bookmarked} />}
          pressed={post?.bookmarked}
          onClick={toggleBookmark}
          className="btn-tertiary-bun"
        />
      </SimpleTooltip>
      <SimpleTooltip
        placement="left"
        content="Share post"
        appendTo="parent"
        container={tooltipContainerProps}
      >
        <Button
          className="btn-tertiary-cabbage"
          onClick={onShare}
          icon={<ShareIcon />}
        />
      </SimpleTooltip>
      <SimpleTooltip
        placement="left"
        content="More options"
        appendTo="parent"
        container={tooltipContainerProps}
      >
        <Button
          className="btn-tertiary"
          icon={<MenuIcon />}
          onClick={onContextOptions}
        />
      </SimpleTooltip>
      <CompanionContextMenu
        onShare={onShare}
        postData={post}
        onReport={report}
        onBlockSource={blockSource}
        onDisableCompanion={optOut}
      />
      {parentComment && (
        <NewCommentModal
          isOpen={!!parentComment}
          parentSelector={getCompanionWrapper}
          onRequestClose={closeNewComment}
          onInputChange={onInput}
          parentComment={parentComment}
          post={post}
        />
      )}
      {sharePost && (
        <ShareModal
          isOpen={!!sharePost}
          parentSelector={getCompanionWrapper}
          post={sharePost}
          origin={Origin.Companion}
          onRequestClose={closeSharePost}
        />
      )}
      {modal?.type === LazyModal.PostToSquad && (
        <PostToSquadModal
          isOpen
          parentSelector={getCompanionWrapper}
          requestMethod={companionRequest}
          onRequestClose={closeModal}
          {...(modal.props as PostToSquadModalProps)}
        />
      )}
    </div>
  );
}
