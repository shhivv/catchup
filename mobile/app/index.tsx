import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  runOnJS,
  FadeIn,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import RenderHtml from "react-native-render-html";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getFeed,
  getArticle,
  markRead,
  archiveArticle,
  bookmarkArticle,
  recordInterest,
  Article,
  Segment,
} from "../lib/api";
import { colors, spacing } from "../lib/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING_CONFIG = { damping: 20, stiffness: 300, mass: 0.8 };
const SPRING_SNAPPY = { damping: 15, stiffness: 400, mass: 0.5 };
const ENTER_DURATION = 500;
const ENTER_EASE = Easing.out(Easing.exp);

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>?/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
  };
  return str
    .replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));/g, (match, dec, hex, named) => {
      if (dec) return String.fromCharCode(parseInt(dec, 10));
      if (hex) return String.fromCharCode(parseInt(hex, 16));
      return entities[`&${named};`] ?? match;
    });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const domVisitors = {
  onElement: (el: any) => {
    if (el.name === "img") {
      const src = el.attribs?.src || "";
      if (!src.startsWith("http://") && !src.startsWith("https://")) {
        el.attribs = { ...el.attribs, src: "" };
        el.name = "span";
      }
    }
  },
};

const baseTagsStyles = {
  body: {
    color: "#c4c0bb",
    fontFamily: "Geist",
    fontSize: 18,
    lineHeight: 32,
  },
  p: { marginBottom: 0, marginTop: 0 },
  a: { color: "#c4c0bb", textDecorationLine: "underline" as const, textDecorationColor: "#555" },
  h1: {
    fontFamily: "Geist-Bold",
    fontSize: 24,
    color: colors.text,
  },
  h2: {
    fontFamily: "Geist-Bold",
    fontSize: 20,
    color: colors.text,
  },
  h3: {
    fontFamily: "Geist-Bold",
    fontSize: 18,
    color: colors.text,
  },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingLeft: 16,
    fontStyle: "italic" as const,
    color: colors.textSecondary,
  },
  img: { borderRadius: 10 },
  pre: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  code: {
    fontFamily: "Geist-Mono",
    fontSize: 14,
    backgroundColor: colors.bgRaised,
  },
  li: { color: colors.text },
};

function ActionButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withSpring(0.92, SPRING_SNAPPY);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING_CONFIG);
      }}
      onPress={onPress}
      hitSlop={12}
      style={[styles.actionBtn, active && styles.actionBtnActive, animatedStyle]}
    >
      <Text style={[styles.actionLabel, active && styles.actionLabelActive]}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

function TappableParagraph({
  segment,
  articleId,
  isTapped,
  contentWidth,
  enterDelay,
}: {
  segment: Segment;
  articleId: number;
  isTapped: boolean;
  contentWidth: number;
  enterDelay: number;
}) {
  const [tapped, setTapped] = useState(isTapped);
  const bgOpacity = useSharedValue(isTapped ? 0.06 : 0);
  const lineScale = useSharedValue(isTapped ? 1 : 0);
  const heartScale = useSharedValue(isTapped ? 1 : 0);
  const lastTap = useRef(0);

  const enterOpacity = useSharedValue(0);
  const enterY = useSharedValue(8);

  useEffect(() => {
    enterOpacity.value = withDelay(
      enterDelay,
      withTiming(1, { duration: ENTER_DURATION, easing: ENTER_EASE })
    );
    enterY.value = withDelay(
      enterDelay,
      withTiming(0, { duration: ENTER_DURATION, easing: ENTER_EASE })
    );
  }, [enterDelay, enterOpacity, enterY]);

  const animatedBg = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255, 107, 138, ${bgOpacity.value})`,
    opacity: enterOpacity.value,
    transform: [{ translateY: enterY.value }],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: lineScale.value }],
    opacity: lineScale.value,
  }));

  const heartStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartScale.value,
  }));

  function handlePress() {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (!tapped) {
        setTapped(true);
        bgOpacity.value = withSequence(
          withTiming(0.14, { duration: 150 }),
          withTiming(0.06, { duration: 500, easing: Easing.out(Easing.quad) })
        );
        lineScale.value = withSpring(1, SPRING_CONFIG);
        heartScale.value = withSequence(
          withSpring(1.3, { damping: 8, stiffness: 400, mass: 0.4 }),
          withSpring(1, SPRING_CONFIG)
        );
        recordInterest(articleId, segment.index, segment.text).catch(() => {});
      }
    }
    lastTap.current = now;
  }

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.paragraph, animatedBg]}>
        <RenderHtml
          contentWidth={contentWidth}
          source={{ html: segment.html }}
          tagsStyles={baseTagsStyles}
          domVisitors={domVisitors}
          defaultTextProps={{ selectable: true }}
        />
        {tapped && (
          <>
            <Animated.View style={[styles.tappedLine, lineStyle]} />
            <Animated.View style={[styles.heartBadge, heartStyle]}>
              <Feather name="heart" size={11} color="#FF6B8A" />
            </Animated.View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

function SkeletonBlock({ width, height, radius = 6, delay = 0 }: {
  width: number | string;
  height: number;
  radius?: number;
  delay?: number;
}) {
  const shimmer = useSharedValue(0.04);

  useEffect(() => {
    shimmer.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.09, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.04, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );
  }, [delay, shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255, 255, 255, ${shimmer.value})`,
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
        },
        animatedStyle,
      ]}
    />
  );
}

function ArticleSkeleton({ width }: { width: number }) {
  const contentWidth = width - spacing.lg * 2;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View
        entering={FadeIn.duration(400)}
        style={[styles.scrollContent, { paddingTop: spacing.sm }]}
      >
        <View style={styles.articleHeader}>
          <View style={styles.metaRow}>
            <SkeletonBlock width={80} height={12} delay={0} />
            <SkeletonBlock width={100} height={12} delay={50} />
          </View>
          <SkeletonBlock width={contentWidth * 0.9} height={28} radius={4} delay={80} />
          <SkeletonBlock width={contentWidth * 0.7} height={28} radius={4} delay={100} />
          <SkeletonBlock width={contentWidth} height={18} radius={4} delay={140} />
          <SkeletonBlock width={contentWidth * 0.6} height={18} radius={4} delay={160} />
          <View style={styles.metaRow}>
            <SkeletonBlock width={90} height={12} delay={200} />
            <SkeletonBlock width={70} height={12} delay={220} />
          </View>
          <View style={styles.actionRow}>
            <SkeletonBlock width={80} height={26} radius={14} delay={260} />
            <SkeletonBlock width={56} height={26} radius={14} delay={280} />
          </View>
        </View>
        <SkeletonBlock width={contentWidth} height={200} radius={12} delay={320} />
        <View style={{ gap: 16, marginTop: 28 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ gap: 8 }}>
              <SkeletonBlock width={contentWidth} height={14} delay={380 + i * 40} />
              <SkeletonBlock width={contentWidth * 0.85} height={14} delay={400 + i * 40} />
              <SkeletonBlock width={contentWidth * 0.65} height={14} delay={420 + i * 40} />
            </View>
          ))}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

function InlineSkeleton({ contentWidth }: { contentWidth: number }) {
  return (
    <View style={[styles.scrollContent, { paddingTop: spacing.sm }]}>
      <View style={styles.articleHeader}>
        <View style={styles.metaRow}>
          <SkeletonBlock width={80} height={12} delay={0} />
          <SkeletonBlock width={100} height={12} delay={50} />
        </View>
        <SkeletonBlock width={contentWidth * 0.9} height={28} radius={4} delay={80} />
        <SkeletonBlock width={contentWidth * 0.7} height={28} radius={4} delay={100} />
        <SkeletonBlock width={contentWidth} height={18} radius={4} delay={140} />
        <SkeletonBlock width={contentWidth * 0.6} height={18} radius={4} delay={160} />
        <View style={styles.metaRow}>
          <SkeletonBlock width={90} height={12} delay={200} />
          <SkeletonBlock width={70} height={12} delay={220} />
        </View>
      </View>
      <SkeletonBlock width={contentWidth} height={200} radius={12} delay={280} />
      <View style={{ gap: 16, marginTop: 28 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ gap: 8 }}>
            <SkeletonBlock width={contentWidth} height={14} delay={340 + i * 40} />
            <SkeletonBlock width={contentWidth * 0.85} height={14} delay={360 + i * 40} />
            <SkeletonBlock width={contentWidth * 0.65} height={14} delay={380 + i * 40} />
          </View>
        ))}
      </View>
    </View>
  );
}

function FadeImage({ uri, style }: { uri: string; style: any }) {
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Image
        source={{ uri }}
        style={style}
        resizeMode="cover"
        onLoad={() => {
          opacity.value = withTiming(1, {
            duration: 400,
            easing: Easing.out(Easing.quad),
          });
        }}
      />
    </Animated.View>
  );
}

interface FullArticle extends Article {
  segments?: Segment[];
  tappedParagraphs?: number[];
}

const PREFETCH_AHEAD = 10;
const PREFETCH_BEHIND = 3;
const articleCache = new Map<number, FullArticle>();
const inflightFetches = new Map<number, Promise<FullArticle | null>>();

function fetchAndCache(id: number): Promise<FullArticle | null> {
  if (articleCache.has(id)) return Promise.resolve(articleCache.get(id)!);
  if (inflightFetches.has(id)) return inflightFetches.get(id)!;
  const promise = getArticle(id)
    .then((art: FullArticle) => {
      articleCache.set(id, art);
      inflightFetches.delete(id);
      return art;
    })
    .catch(() => {
      inflightFetches.delete(id);
      return null;
    });
  inflightFetches.set(id, promise);
  return promise;
}

function prefetchAround(feedIds: number[], index: number) {
  for (let i = 1; i <= PREFETCH_AHEAD; i++) {
    const idx = index + i;
    if (idx < feedIds.length && !articleCache.has(feedIds[idx])) {
      fetchAndCache(feedIds[idx]);
    }
  }
  for (let i = 1; i <= PREFETCH_BEHIND; i++) {
    const idx = index - i;
    if (idx >= 0 && !articleCache.has(feedIds[idx])) {
      fetchAndCache(feedIds[idx]);
    }
  }
}

function ArticleHeader({
  article,
  bookmarked,
  onToggleBookmark,
  onShare,
}: {
  article: FullArticle;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  onShare: () => void;
}) {
  const bookmarkScale = useSharedValue(1);

  const prevBookmarked = useRef(bookmarked);
  useEffect(() => {
    if (bookmarked !== prevBookmarked.current) {
      bookmarkScale.value = withSequence(
        withSpring(1.15, { damping: 8, stiffness: 500, mass: 0.3 }),
        withSpring(1, SPRING_CONFIG)
      );
      prevBookmarked.current = bookmarked;
    }
  }, [bookmarked, bookmarkScale]);

  return (
    <View style={styles.articleHeader}>
      <Animated.View
        entering={FadeIn.duration(ENTER_DURATION).easing(ENTER_EASE)}
        style={styles.metaRow}
      >
        {article.site_name ? (
          <Text style={styles.siteName}>{article.site_name}</Text>
        ) : null}
        {article.published_date ? (
          <>
            <Text style={styles.metaDot}>{"·"}</Text>
            <Text style={styles.metaDate}>
              {formatDate(article.published_date)}
            </Text>
          </>
        ) : null}
      </Animated.View>

      <Animated.Text
        entering={FadeIn.duration(ENTER_DURATION)
          .easing(ENTER_EASE)
          .delay(60)}
        style={styles.title}
      >
        {decodeEntities(article.title)}
      </Animated.Text>

      {article.excerpt ? (
        <Animated.Text
          entering={FadeIn.duration(ENTER_DURATION)
            .easing(ENTER_EASE)
            .delay(120)}
          style={styles.excerpt}
        >
          {stripHtml(decodeEntities(article.excerpt))}
        </Animated.Text>
      ) : null}

      <Animated.View
        entering={FadeIn.duration(ENTER_DURATION)
          .easing(ENTER_EASE)
          .delay(180)}
        style={styles.metaRow}
      >
        {article.author ? (
          <Text style={styles.author}>{article.author}</Text>
        ) : null}
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(ENTER_DURATION)
          .easing(ENTER_EASE)
          .delay(240)}
        style={styles.actionRow}
      >
        <ActionButton
          label={bookmarked ? "bookmarked" : "bookmark"}
          active={bookmarked}
          onPress={onToggleBookmark}
        />
        <ActionButton label="share" onPress={onShare} />
      </Animated.View>
    </View>
  );
}

export default function FeedReaderScreen() {
  const { width } = useWindowDimensions();
  const contentWidth = width - spacing.lg * 2;

  const [feedIds, setFeedIds] = useState<number[]>([]);
  const feedIdsRef = useRef<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentIndexRef = useRef(0);
  const [article, setArticle] = useState<FullArticle | null>(null);
  const articleRef = useRef<FullArticle | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tappedParagraphs, setTappedParagraphs] = useState<Set<number>>(
    new Set()
  );
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [articleKey, setArticleKey] = useState(0);

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scrollRef = useRef<ScrollView>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await getFeed("all", 1, 100);
      const ids = data.articles.map((a: Article) => a.id);
      feedIdsRef.current = ids;
      setFeedIds(ids);
      if (ids.length === 0) {
        setEmpty(true);
        setLoading(false);
        return;
      }
      setEmpty(false);
      return ids;
    } catch {
      setLoading(false);
      return [];
    }
  }, []);

  const showArticle = useCallback((art: FullArticle) => {
    articleRef.current = art;
    setArticle(art);
    setSegments(art.segments || []);
    setTappedParagraphs(new Set(art.tappedParagraphs || []));
    setBookmarked(!!art.is_bookmarked);
    setArticleKey((k) => k + 1);
    AsyncStorage.setItem("lastArticleId", String(art.id)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const savedId = await AsyncStorage.getItem("lastArticleId").catch(
        () => null
      );
      const ids = await fetchFeed();

      if (savedId) {
        const saved = await fetchAndCache(parseInt(savedId));
        if (saved) {
          showArticle(saved);
          if (ids && ids.length > 0) {
            const idx = ids.indexOf(saved.id);
            if (idx >= 0) {
              currentIndexRef.current = idx;
              setCurrentIndex(idx);
            }
            prefetchAround(ids, idx >= 0 ? idx : 0);
          }
          setLoading(false);
          return;
        }
      }

      if (ids && ids.length > 0) {
        const first = await fetchAndCache(ids[0]);
        if (first) {
          showArticle(first);
          markRead(ids[0]).catch(() => {});
        }
        prefetchAround(ids, 0);
      }
      setLoading(false);
    })();
  }, [fetchFeed, showArticle]);

  const pendingReveal = useRef<"instant" | "fade">("instant");

  useEffect(() => {
    if (pendingReveal.current === "instant") {
      opacity.value = 1;
    } else {
      opacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [articleKey, opacity]);

  const navigate = useCallback(
    (direction: 1 | -1) => {
      const ids = feedIdsRef.current;
      const idx = currentIndexRef.current;
      const nextIndex = idx + direction;
      if (nextIndex < 0 || nextIndex >= ids.length) return;

      if (direction === 1 && articleRef.current) {
        archiveArticle(articleRef.current.id).catch(() => {});
      }

      translateX.value = 0;
      opacity.value = 0;

      const nextId = ids[nextIndex];
      const cached = articleCache.get(nextId);

      scrollRef.current?.scrollTo({ y: 0, animated: false });
      currentIndexRef.current = nextIndex;
      setCurrentIndex(nextIndex);
      prefetchAround(ids, nextIndex);

      if (cached) {
        pendingReveal.current = "instant";
        showArticle(cached);
        markRead(nextId).catch(() => {});
      } else {
        pendingReveal.current = "fade";
        articleRef.current = null;
        setArticle(null);
        setArticleKey((k) => k + 1);
        fetchAndCache(nextId).then((art) => {
          if (art) {
            showArticle(art);
            markRead(nextId).catch(() => {});
          }
        });
      }
    },
    [showArticle, translateX, opacity]
  );

  const goNext = useCallback(() => navigate(1), [navigate]);
  const goPrev = useCallback(() => navigate(-1), [navigate]);

  const toggleBookmark = useCallback(() => {
    if (!article) return;
    const next = !bookmarked;
    setBookmarked(next);
    bookmarkArticle(article.id, next).catch(() => {});
  }, [article, bookmarked]);

  const shareArticle = useCallback(() => {
    if (!article) return;
    Share.share({
      message: `${article.title}\n${article.url}`,
      url: article.url,
    }).catch(() => {});
  }, [article]);

  const hasNext = currentIndex < feedIds.length - 1;
  const hasPrev = currentIndex > 0;

  const gesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const resistance = 0.35;
      const edgeDamping =
        (e.translationX < 0 && !hasNext) || (e.translationX > 0 && !hasPrev)
          ? 0.12
          : resistance;
      translateX.value = e.translationX * edgeDamping;
      const progress = Math.min(Math.abs(e.translationX) / 120, 1);
      opacity.value = 1 - progress * 0.15;
    })
    .onEnd((e) => {
      if (e.translationX < -80 && hasNext) {
        opacity.value = withTiming(0, {
          duration: 150,
          easing: Easing.in(Easing.quad),
        });
        translateX.value = withTiming(
          -width * 0.25,
          { duration: 150, easing: Easing.in(Easing.quad) },
          () => {
            runOnJS(goNext)();
          }
        );
      } else if (e.translationX > 80 && hasPrev) {
        opacity.value = withTiming(0, {
          duration: 150,
          easing: Easing.in(Easing.quad),
        });
        translateX.value = withTiming(
          width * 0.25,
          { duration: 150, easing: Easing.in(Easing.quad) },
          () => {
            runOnJS(goPrev)();
          }
        );
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
        opacity.value = withSpring(1, SPRING_CONFIG);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, width * 0.3],
      [1, 0.97]
    );
    return {
      transform: [{ translateX: translateX.value }, { scale }],
      opacity: opacity.value,
    };
  });

  if (loading) {
    return <ArticleSkeleton width={width} />;
  }

  if (empty) {
    return (
      <View style={styles.center}>
        <Animated.View
          entering={FadeIn.duration(600).easing(ENTER_EASE)}
          style={{ alignItems: "center" }}
        >
          <Text style={styles.emptyTitle}>nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            articles you don't finish reading will show up here
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ flex: 1 }, animatedStyle]}>
            {article ? (
              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <ArticleHeader
                  key={`header-${articleKey}`}
                  article={article}
                  bookmarked={bookmarked}
                  onToggleBookmark={toggleBookmark}
                  onShare={shareArticle}
                />

                {article.lead_image_url ? (
                  <Animated.View
                    entering={FadeIn.duration(ENTER_DURATION)
                      .easing(ENTER_EASE)
                      .delay(300)}
                  >
                    <FadeImage
                      uri={article.lead_image_url}
                      style={styles.leadImage}
                    />
                  </Animated.View>
                ) : null}

                {segments.length > 0 ? (
                  <View style={styles.segmentList}>
                    {segments.map((seg, i) => (
                      <TappableParagraph
                        key={`${articleKey}-${seg.index}`}
                        segment={seg}
                        articleId={article.id}
                        isTapped={tappedParagraphs.has(seg.index)}
                        contentWidth={contentWidth}
                        enterDelay={Math.min(360 + i * 30, 800)}
                      />
                    ))}
                  </View>
                ) : article.content ? (
                  <Animated.View
                    entering={FadeIn.duration(ENTER_DURATION)
                      .easing(ENTER_EASE)
                      .delay(360)}
                  >
                    <RenderHtml
                      contentWidth={contentWidth}
                      source={{ html: article.content }}
                      tagsStyles={baseTagsStyles}
                      defaultTextProps={{ selectable: true }}
                    />
                  </Animated.View>
                ) : (
                  <Animated.View
                    entering={FadeIn.duration(ENTER_DURATION)
                      .easing(ENTER_EASE)
                      .delay(360)}
                  >
                    <Text style={styles.plainText}>
                      {article.text_content}
                    </Text>
                  </Animated.View>
                )}

                <View style={{ height: 60 }} />
              </ScrollView>
            ) : (
              <InlineSkeleton contentWidth={contentWidth} />
            )}
          </Animated.View>
        </GestureDetector>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 80,
    paddingTop: spacing.sm,
  },
  articleHeader: {
    marginBottom: 24,
    gap: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  siteName: {
    fontSize: 12,
    fontFamily: "Geist-Mono",
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metaDot: { color: colors.textTertiary, fontSize: 12 },
  metaDate: {
    fontSize: 12,
    fontFamily: "Geist-Mono",
    color: colors.textTertiary,
  },
  title: {
    fontFamily: "Geist-Bold",
    fontSize: 28,
    lineHeight: 36,
    color: colors.text,
    letterSpacing: -0.3,
  },
  excerpt: {
    fontFamily: "Geist",
    fontSize: 18,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  author: {
    fontSize: 12,
    fontFamily: "Geist-Mono",
    color: colors.textTertiary,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnActive: {
    borderColor: colors.accent,
    backgroundColor: "rgba(201, 168, 124, 0.1)",
  },
  actionLabel: {
    fontFamily: "Geist-Mono",
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  actionLabelActive: {
    color: colors.accent,
  },
  leadImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 28,
  },
  segmentList: {
    gap: 4,
  },
  paragraph: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    position: "relative",
  },
  tappedLine: {
    position: "absolute",
    left: -4,
    top: 4,
    bottom: 4,
    width: 2.5,
    backgroundColor: "#FF6B8A",
    borderRadius: 2,
    opacity: 0.7,
  },
  heartBadge: {
    position: "absolute",
    right: -2,
    top: 4,
  },
  plainText: {
    fontFamily: "Geist",
    fontSize: 18,
    lineHeight: 32,
    color: colors.text,
  },
  emptyTitle: {
    fontFamily: "Geist",
    fontSize: 20,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
  },
});
