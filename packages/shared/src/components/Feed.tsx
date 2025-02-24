import React, {
  CSSProperties,
  ReactElement,
  ReactNode,
  useContext,
  useEffect,
} from 'react';
import classNames from 'classnames';
import dynamic from 'next/dynamic';
import useFeed, { PostItem, UseFeedOptionalParams } from '../hooks/useFeed';
import { Ad, Post, PostType } from '../graphql/posts';
import AuthContext from '../contexts/AuthContext';
import FeedContext from '../contexts/FeedContext';
import styles from './Feed.module.css';
import SettingsContext from '../contexts/SettingsContext';
import { Spaciness } from '../graphql/settings';
import ScrollToTopButton from './ScrollToTopButton';
import useFeedUpvotePost from '../hooks/feed/useFeedUpvotePost';
import useFeedBookmarkPost from '../hooks/feed/useFeedBookmarkPost';
import useCommentPopup from '../hooks/feed/useCommentPopup';
import useFeedOnPostClick, {
  FeedPostClick,
} from '../hooks/feed/useFeedOnPostClick';
import useFeedContextMenu from '../hooks/feed/useFeedContextMenu';
import useFeedInfiniteScroll, {
  InfiniteScrollScreenOffset,
} from '../hooks/feed/useFeedInfiniteScroll';
import FeedItemComponent, { getFeedItemKey } from './FeedItemComponent';
import AnalyticsContext from '../contexts/AnalyticsContext';
import {
  adAnalyticsEvent,
  feedAnalyticsExtra,
  postAnalyticsEvent,
} from '../lib/feed';
import PostOptionsMenu from './PostOptionsMenu';
import FeaturesContext from '../contexts/FeaturesContext';
import { usePostModalNavigation } from '../hooks/usePostModalNavigation';
import {
  ToastSubject,
  useToastNotification,
} from '../hooks/useToastNotification';
import { useSharePost } from '../hooks/useSharePost';
import { AnalyticsEvent, Origin } from '../lib/analytics';
import ShareOptionsMenu from './ShareOptionsMenu';
import { ExperimentWinner } from '../lib/featureValues';
import useSidebarRendered from '../hooks/useSidebarRendered';
import AlertContext from '../contexts/AlertContext';
import OnboardingContext from '../contexts/OnboardingContext';
import { MainFeedPage } from './utilities';

export interface FeedProps<T>
  extends Pick<UseFeedOptionalParams<T>, 'options'> {
  feedName: string;
  feedQueryKey: unknown[];
  query?: string;
  variables?: T;
  className?: string;
  onEmptyFeed?: () => unknown;
  emptyScreen?: ReactNode;
  header?: ReactNode;
  forceCardMode?: boolean;
}

interface RankVariables {
  ranking?: string;
}

const ShareModal = dynamic(
  () => import(/* webpackChunkName: "shareModal" */ './modals/ShareModal'),
);
const ArticlePostModal = dynamic(
  () =>
    import(
      /* webpackChunkName: "articlePostModal" */ './modals/ArticlePostModal'
    ),
);
const SharePostModal = dynamic(
  () =>
    import(/* webpackChunkName: "sharePostModal" */ './modals/SharePostModal'),
);
const ScrollFeedFiltersOnboarding = dynamic(
  () =>
    import(
      /* webpackChunkName: "scrollFeedFiltersOnboarding" */ './ScrollFeedFiltersOnboarding'
    ),
);

const listGaps = {
  cozy: 'gap-5',
  roomy: 'gap-3',
};
const gridGaps = {
  cozy: 'gap-14',
  roomy: 'gap-12',
};
const getFeedGapPx = {
  'gap-2': 8,
  'gap-3': 12,
  'gap-5': 20,
  'gap-8': 32,
  'gap-12': 48,
  'gap-14': 56,
};
const gapClass = (useList: boolean, spaciness: Spaciness) =>
  useList ? listGaps[spaciness] ?? 'gap-2' : gridGaps[spaciness] ?? 'gap-8';

const cardListClass = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
};
const cardClass = (useList: boolean, numCards: number): string =>
  useList ? 'grid-cols-1' : cardListClass[numCards];

const calculateRow = (index: number, numCards: number): number =>
  Math.floor(index / numCards);
const calculateColumn = (index: number, numCards: number): number =>
  index % numCards;

const getStyle = (useList: boolean, spaciness: Spaciness): CSSProperties => {
  if (useList && spaciness !== 'eco') {
    return spaciness === 'cozy'
      ? { maxWidth: '48.75rem' }
      : { maxWidth: '63.75rem' };
  }
  return {};
};

const PostModalMap: Record<PostType, typeof ArticlePostModal> = {
  [PostType.Article]: ArticlePostModal,
  [PostType.Share]: SharePostModal,
  [PostType.Welcome]: SharePostModal,
};

export default function Feed<T>({
  feedName,
  feedQueryKey,
  query,
  variables,
  className,
  header,
  onEmptyFeed,
  emptyScreen,
  forceCardMode,
  options,
}: FeedProps<T>): ReactElement {
  const { showCommentPopover } = useContext(FeaturesContext);
  const { alerts } = useContext(AlertContext);
  const { onInitializeOnboarding } = useContext(OnboardingContext);
  const { trackEvent } = useContext(AnalyticsContext);
  const currentSettings = useContext(FeedContext);
  const { user } = useContext(AuthContext);
  const { sidebarRendered } = useSidebarRendered();
  const { subject } = useToastNotification();
  const {
    openNewTab,
    spaciness,
    insaneMode: listMode,
    loadedSettings,
  } = useContext(SettingsContext);
  const insaneMode = !forceCardMode && listMode;
  const numCards = currentSettings.numCards[spaciness ?? 'eco'];
  const {
    items,
    updatePost,
    removePost,
    fetchPage,
    canFetchMore,
    emptyFeed,
    isLoading,
  } = useFeed(
    feedQueryKey,
    currentSettings.pageSize,
    currentSettings.adSpot,
    numCards,
    { query, variables, options },
  );

  const { ranking } = (variables as RankVariables) || {};
  const {
    onOpenModal,
    onCloseModal,
    onPrevious,
    onNext,
    postPosition,
    selectedPost,
    selectedPostIndex,
  } = usePostModalNavigation(items, fetchPage, updatePost, canFetchMore);

  useEffect(() => {
    if (emptyFeed) {
      onEmptyFeed?.();
    }
    // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyFeed]);

  const showScrollOnboardingVersion =
    sidebarRendered &&
    feedName === MainFeedPage.Popular &&
    !isLoading &&
    alerts?.filter &&
    !user?.id;

  const infiniteScrollRef = useFeedInfiniteScroll({
    fetchPage,
    canFetchMore: canFetchMore && !showScrollOnboardingVersion,
  });

  const onInitializeOnboardingClick = () => {
    trackEvent({
      event_name: AnalyticsEvent.ClickScrollBlock,
      target_id: ExperimentWinner.ScrollOnboardingVersion,
    });
    onInitializeOnboarding(undefined, true);
  };

  const useList = insaneMode && numCards > 1;
  const virtualizedNumCards = useList ? 1 : numCards;
  const feedGapPx = getFeedGapPx[gapClass(useList, spaciness)];

  if (!loadedSettings) {
    return <></>;
  }

  const {
    showCommentPopupId,
    setShowCommentPopupId,
    comment,
    isSendingComment,
    // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
    // eslint-disable-next-line react-hooks/rules-of-hooks
  } = useCommentPopup(feedName);

  // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const onUpvote = useFeedUpvotePost(
    items,
    updatePost,
    showCommentPopover && setShowCommentPopupId,
    virtualizedNumCards,
    feedName,
    ranking,
  );
  // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const onBookmark = useFeedBookmarkPost(
    items,
    updatePost,
    virtualizedNumCards,
    feedName,
    ranking,
  );
  // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const onPostClick = useFeedOnPostClick(
    items,
    updatePost,
    virtualizedNumCards,
    feedName,
    ranking,
  );

  // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const onReadArticleClick = useFeedOnPostClick(
    items,
    updatePost,
    virtualizedNumCards,
    feedName,
    ranking,
    'go to link',
  );

  const onPostModalOpen = (index: number, callback?: () => unknown) => {
    document.body.classList.add('hidden-scrollbar');
    callback?.();
    onOpenModal(index);
  };

  const onPostCardClick: FeedPostClick = async (post, index, row, column) => {
    await onPostClick(post, index, row, column, {
      skipPostUpdate: true,
    });
    onPostModalOpen(index);
  };

  const {
    onMenuClick,
    onShareMenuClick,
    postMenuIndex,
    postMenuLocation,
    setPostMenuIndex,
    // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
    // eslint-disable-next-line react-hooks/rules-of-hooks
  } = useFeedContextMenu();
  let lastShareMenuCloseTrackEvent = () => {};
  const onShareMenuClickTracked = (
    e: React.MouseEvent,
    post: Post,
    index: number,
    row: number,
    column: number,
  ) => {
    onShareMenuClick(e, post, index, row, column);
    const trackEventOptions = {
      columns: virtualizedNumCards,
      column,
      row,
      ...feedAnalyticsExtra(
        feedName,
        ranking,
        undefined,
        undefined,
        ExperimentWinner.PostCardShareVersion,
      ),
    };
    trackEvent(postAnalyticsEvent('open share', post, trackEventOptions));
    lastShareMenuCloseTrackEvent = () => {
      trackEvent(postAnalyticsEvent('close share', post, trackEventOptions));
    };
  };
  const onShareOptionsHidden = () => {
    setPostMenuIndex(null);
    lastShareMenuCloseTrackEvent();
  };
  const onRemovePost = async (removePostIndex) => {
    const item = items[removePostIndex] as PostItem;
    removePost(item.page, item.index);
  };

  const onCommentClick = (
    post: Post,
    index: number,
    row: number,
    column: number,
  ): void => {
    onPostModalOpen(index, () =>
      trackEvent(
        postAnalyticsEvent('comments click', post, {
          columns: virtualizedNumCards,
          column,
          row,
          ...feedAnalyticsExtra(feedName, ranking),
        }),
      ),
    );
  };

  const onAdClick = (ad: Ad, index: number, row: number, column: number) => {
    trackEvent(
      adAnalyticsEvent('click', ad, {
        columns: virtualizedNumCards,
        column,
        row,
        ...feedAnalyticsExtra(feedName, ranking),
      }),
    );
  };

  const style = {
    '--num-cards': numCards,
    '--feed-gap': `${feedGapPx / 16}rem`,
  } as React.CSSProperties;
  const cardContainerStye = { ...getStyle(useList, spaciness) };

  if (emptyScreen && emptyFeed) {
    return <>{emptyScreen}</>;
  }
  const { sharePost, sharePostFeedLocation, openSharePost, closeSharePost } =
    // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSharePost(Origin.Feed);
  const onShareClick = (post: Post, row?: number, column?: number) =>
    openSharePost(post, virtualizedNumCards, column, row);

  // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    return () => {
      document.body.classList.remove('hidden-scrollbar');
    };
  }, []);

  // @NOTE see https://dailydotdev.atlassian.net/l/cp/dK9h1zoM
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!selectedPost) {
      document.body.classList.remove('hidden-scrollbar');
    }
  }, [selectedPost]);
  const post = (items[postMenuIndex] as PostItem)?.post;
  const commonMenuItems = {
    onShare: () =>
      openSharePost(
        post,
        virtualizedNumCards,
        postMenuLocation.row,
        postMenuLocation.column,
      ),
    onBookmark: () => {
      const targetBookmarkState = !post?.bookmarked;
      onBookmark(
        post,
        postMenuIndex,
        postMenuLocation.row,
        postMenuLocation.column,
        targetBookmarkState,
      );
    },
    post,
  };

  const ArticleModal = PostModalMap[selectedPost?.type];

  return (
    <div
      className={classNames(
        'flex flex-col laptopL:mx-auto w-full',
        styles.container,
        className,
      )}
      style={style}
    >
      {header}
      <div
        className={classNames(
          'relative mx-auto w-full',
          styles.feed,
          !useList && styles.cards,
        )}
        style={cardContainerStye}
        aria-live={subject === ToastSubject.Feed ? 'assertive' : 'off'}
        data-testid="posts-feed"
      >
        <ScrollToTopButton />
        <div
          className={classNames(
            'grid',
            gapClass(useList, spaciness),
            cardClass(useList, numCards),
          )}
        >
          {items.map((item, index) => (
            <FeedItemComponent
              items={items}
              index={index}
              row={calculateRow(index, virtualizedNumCards)}
              column={calculateColumn(index, virtualizedNumCards)}
              columns={virtualizedNumCards}
              key={getFeedItemKey(items, index)}
              useList={useList}
              openNewTab={openNewTab}
              insaneMode={insaneMode}
              postMenuIndex={postMenuIndex}
              showCommentPopupId={showCommentPopupId}
              setShowCommentPopupId={setShowCommentPopupId}
              isSendingComment={isSendingComment}
              comment={comment}
              user={user}
              feedName={feedName}
              ranking={ranking}
              onUpvote={onUpvote}
              onBookmark={onBookmark}
              onPostClick={onPostCardClick}
              onShare={onShareClick}
              onMenuClick={onMenuClick}
              onShareClick={onShareMenuClickTracked}
              onCommentClick={onCommentClick}
              onAdClick={onAdClick}
              onReadArticleClick={onReadArticleClick}
            />
          ))}
        </div>
        {showScrollOnboardingVersion && (
          <ScrollFeedFiltersOnboarding
            onInitializeOnboarding={onInitializeOnboardingClick}
          />
        )}
        <InfiniteScrollScreenOffset ref={infiniteScrollRef} />
        <PostOptionsMenu
          {...commonMenuItems}
          feedName={feedName}
          feedQueryKey={feedQueryKey}
          postIndex={postMenuIndex}
          onHidden={() => setPostMenuIndex(null)}
          onRemovePost={onRemovePost}
          origin={Origin.Feed}
        />
        <ShareOptionsMenu
          {...commonMenuItems}
          onHidden={onShareOptionsHidden}
        />
        {selectedPost && ArticleModal && (
          <ArticleModal
            isOpen={!!selectedPost}
            id={selectedPost.id}
            onRequestClose={() => onCloseModal(false)}
            onPreviousPost={onPrevious}
            onNextPost={onNext}
            postPosition={postPosition}
            onRemovePost={() => onRemovePost(selectedPostIndex)}
          />
        )}
        {sharePost && (
          <ShareModal
            isOpen={!!sharePost}
            post={sharePost}
            origin={Origin.Feed}
            {...sharePostFeedLocation}
            onRequestClose={closeSharePost}
          />
        )}
      </div>
    </div>
  );
}
