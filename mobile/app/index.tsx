import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
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
  runOnJS,
} from "react-native-reanimated";
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

function readingTime(wordCount: number): string {
  return `${Math.max(1, Math.round(wordCount / 238))} min read`;
}

const baseTagsStyles = {
  body: {
    color: colors.text,
    fontFamily: "EB-Garamond",
    fontSize: 19,
    lineHeight: 32,
  },
  p: { marginBottom: 0, marginTop: 0 },
  a: { color: colors.accent, textDecorationLine: "underline" as const },
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
    fontFamily: "EB-Garamond-Italic",
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
  li: { color: colors.text, fontFamily: "EB-Garamond" },
};

function TappableParagraph({
  segment,
  articleId,
  isTapped,
  contentWidth,
}: {
  segment: Segment;
  articleId: number;
  isTapped: boolean;
  contentWidth: number;
}) {
  const [tapped, setTapped] = useState(isTapped);
  const bgOpacity = useSharedValue(isTapped ? 0.06 : 0);
  const lastTap = useRef(0);

  const animatedBg = useAnimatedStyle(() => ({
    backgroundColor: `rgba(255, 107, 138, ${bgOpacity.value})`,
  }));

  function handlePress() {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (!tapped) {
        setTapped(true);
        bgOpacity.value = withTiming(0.12, { duration: 200 });
        setTimeout(() => {
          bgOpacity.value = withTiming(0.06, { duration: 400 });
        }, 600);
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
          defaultTextProps={{ selectable: true }}
        />
        {tapped && (
          <>
            <View style={styles.tappedLine} />
            <View style={styles.heartBadge}>
              <Text style={styles.heartIcon}>{"❤️"}</Text>
            </View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

interface FullArticle extends Article {
  segments?: Segment[];
  tappedParagraphs?: number[];
}

const PREFETCH_AHEAD = 3;
const articleCache = new Map<number, FullArticle>();

async function fetchAndCache(id: number): Promise<FullArticle | null> {
  if (articleCache.has(id)) return articleCache.get(id)!;
  try {
    const art = await getArticle(id);
    articleCache.set(id, art);
    return art;
  } catch {
    return null;
  }
}

function prefetchAround(feedIds: number[], index: number) {
  for (let i = 1; i <= PREFETCH_AHEAD; i++) {
    const nextIdx = index + i;
    if (nextIdx < feedIds.length && !articleCache.has(feedIds[nextIdx])) {
      fetchAndCache(feedIds[nextIdx]);
    }
  }
}

export default function FeedReaderScreen() {
  const { width } = useWindowDimensions();
  const contentWidth = width - spacing.lg * 2;

  const [feedIds, setFeedIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [article, setArticle] = useState<FullArticle | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tappedParagraphs, setTappedParagraphs] = useState<Set<number>>(
    new Set()
  );
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const scrollRef = useRef<ScrollView>(null);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await getFeed("all", 1, 100);
      const ids = data.articles.map((a: Article) => a.id);
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
    setArticle(art);
    setSegments(art.segments || []);
    setTappedParagraphs(new Set(art.tappedParagraphs || []));
    setBookmarked(!!art.is_bookmarked);
    AsyncStorage.setItem("lastArticleId", String(art.id)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const savedId = await AsyncStorage.getItem("lastArticleId").catch(() => null);
      const ids = await fetchFeed();

      if (savedId) {
        const saved = await fetchAndCache(parseInt(savedId));
        if (saved) {
          showArticle(saved);
          if (ids && ids.length > 0) {
            const idx = ids.indexOf(saved.id);
            if (idx >= 0) setCurrentIndex(idx);
          }
          prefetchAround(ids || [], 0);
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

  useEffect(() => {
    if (feedIds.length === 0) return;
    const id = feedIds[currentIndex];
    if (!id) return;

    const cached = articleCache.get(id);
    if (cached) {
      showArticle(cached);
      markRead(id).catch(() => {});
    } else {
      fetchAndCache(id).then((art) => {
        if (art) {
          showArticle(art);
          markRead(id).catch(() => {});
        }
      });
    }

    scrollRef.current?.scrollTo({ y: 0, animated: false });
    prefetchAround(feedIds, currentIndex);
  }, [currentIndex, feedIds, showArticle]);

  const goNext = useCallback(() => {
    if (currentIndex >= feedIds.length - 1) return;
    if (article) archiveArticle(article.id).catch(() => {});
    const nextId = feedIds[currentIndex + 1];
    const cached = articleCache.get(nextId);
    if (cached) {
      showArticle(cached);
      markRead(nextId).catch(() => {});
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    setCurrentIndex((i) => i + 1);
    translateX.value = 0;
    opacity.value = 1;
  }, [currentIndex, feedIds, article, showArticle, translateX, opacity]);

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    const prevId = feedIds[currentIndex - 1];
    const cached = articleCache.get(prevId);
    if (cached) {
      showArticle(cached);
      markRead(prevId).catch(() => {});
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    setCurrentIndex((i) => i - 1);
    translateX.value = 0;
    opacity.value = 1;
  }, [currentIndex, feedIds, showArticle, translateX, opacity]);

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
      translateX.value = e.translationX * 0.3;
      const progress = Math.min(Math.abs(e.translationX) / 100, 1);
      opacity.value = 1 - progress * 0.3;
    })
    .onEnd((e) => {
      if (e.translationX < -80 && hasNext) {
        opacity.value = withTiming(0, { duration: 100 });
        translateX.value = withTiming(-width * 0.3, { duration: 100 }, () => {
          runOnJS(goNext)();
        });
      } else if (e.translationX > 80 && hasPrev) {
        opacity.value = withTiming(0, { duration: 100 });
        translateX.value = withTiming(width * 0.3, { duration: 100 }, () => {
          runOnJS(goPrev)();
        });
      } else {
        translateX.value = withTiming(0, { duration: 100 });
        opacity.value = withTiming(1, { duration: 100 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>nothing here yet</Text>
        <Text style={styles.emptySubtitle}>
          articles you don't finish reading will show up here
        </Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {article ? (
          <GestureDetector gesture={gesture}>
            <Animated.View style={[{ flex: 1 }, animatedStyle]}>
              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.articleHeader}>
                  <View style={styles.metaRow}>
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
                  </View>

                  <Text style={styles.title}>{article.title}</Text>

                  {article.excerpt ? (
                    <Text style={styles.excerpt}>{article.excerpt}</Text>
                  ) : null}

                  <View style={styles.metaRow}>
                    {article.author ? (
                      <Text style={styles.author}>{article.author}</Text>
                    ) : null}
                    {article.word_count > 0 ? (
                      <Text style={styles.readTime}>
                        {readingTime(article.word_count)}
                      </Text>
                    ) : null}
                    <View style={{ flex: 1 }} />
                    <Pressable onPress={toggleBookmark} hitSlop={12}>
                      <Text
                        style={[
                          styles.actionIcon,
                          { opacity: bookmarked ? 1 : 0.35 },
                        ]}
                      >
                        {"\u{1F516}"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={shareArticle} hitSlop={12}>
                      <Text style={[styles.actionIcon, { opacity: 0.5 }]}>
                        {"\u{2197}\u{FE0F}"}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {article.lead_image_url ? (
                  <Image
                    source={{ uri: article.lead_image_url }}
                    style={styles.leadImage}
                    resizeMode="cover"
                  />
                ) : null}

                {segments.length > 0 ? (
                  <View style={styles.segmentList}>
                    {segments.map((seg) => (
                      <TappableParagraph
                        key={seg.index}
                        segment={seg}
                        articleId={article.id}
                        isTapped={tappedParagraphs.has(seg.index)}
                        contentWidth={contentWidth}
                      />
                    ))}
                  </View>
                ) : article.content ? (
                  <RenderHtml
                    contentWidth={contentWidth}
                    source={{ html: article.content }}
                    tagsStyles={baseTagsStyles}
                    defaultTextProps={{ selectable: true }}
                  />
                ) : (
                  <Text style={styles.plainText}>
                    {article.text_content}
                  </Text>
                )}

                <View style={{ height: 60 }} />
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        ) : null}
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
  readTime: {
    fontSize: 12,
    fontFamily: "Geist-Mono",
    color: colors.textTertiary,
  },
  actionIcon: {
    fontSize: 16,
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
  heartIcon: {
    fontSize: 12,
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
