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
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import RenderHtml from "react-native-render-html";
import {
  getFeed,
  getArticle,
  markRead,
  archiveArticle,
  recordInterest,
  isConfigured,
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
    fontFamily: "System",
    fontSize: 18,
    lineHeight: 32,
  },
  p: { marginBottom: 0, marginTop: 0 },
  a: { color: colors.accent, textDecorationLine: "underline" as const },
  h1: {
    fontFamily: "System",
    fontWeight: "600" as const,
    fontSize: 24,
    color: colors.text,
  },
  h2: {
    fontFamily: "System",
    fontWeight: "600" as const,
    fontSize: 20,
    color: colors.text,
  },
  h3: {
    fontFamily: "System",
    fontWeight: "600" as const,
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
    fontFamily: "Courier",
    fontSize: 14,
    backgroundColor: colors.bgRaised,
  },
  li: { color: colors.text },
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
  const bgOpacity = useSharedValue(isTapped ? 0.08 : 0);
  const lastTap = useRef(0);

  const animatedBg = useAnimatedStyle(() => ({
    backgroundColor: `rgba(201, 168, 124, ${bgOpacity.value})`,
  }));

  function handlePress() {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (!tapped) {
        setTapped(true);
        bgOpacity.value = withTiming(0.15, { duration: 200 });
        setTimeout(() => {
          bgOpacity.value = withTiming(0.08, { duration: 400 });
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
          <View style={styles.tappedIndicator}>
            <View style={styles.tappedDot} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

interface FullArticle extends Article {
  segments?: Segment[];
  tappedParagraphs?: number[];
}

export default function FeedReaderScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contentWidth = width - spacing.lg * 2;

  const [feedIds, setFeedIds] = useState<number[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [article, setArticle] = useState<FullArticle | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tappedParagraphs, setTappedParagraphs] = useState<Set<number>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [empty, setEmpty] = useState(false);

  const translateX = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    isConfigured().then((ok) => {
      setConfigured(ok);
      if (!ok) router.replace("/settings");
    });
  }, [router]);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await getFeed("unread", 1, 100);
      const ids = data.articles.map((a: Article) => a.id);
      if (data.suggestions) {
        for (const s of data.suggestions) {
          if (!ids.includes(s.id)) ids.push(s.id);
        }
      }
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

  const loadArticle = useCallback(async (id: number) => {
    setLoadingArticle(true);
    try {
      const art = await getArticle(id);
      setArticle(art);
      setSegments(art.segments || []);
      setTappedParagraphs(new Set(art.tappedParagraphs || []));
      markRead(id).catch(() => {});
    } catch {}
    setLoadingArticle(false);
  }, []);

  useEffect(() => {
    if (configured) {
      setLoading(true);
      fetchFeed().then((ids) => {
        if (ids && ids.length > 0) {
          loadArticle(ids[0]).then(() => setLoading(false));
        }
      });
    }
  }, [configured, fetchFeed, loadArticle]);

  useEffect(() => {
    if (feedIds.length > 0 && feedIds[currentIndex]) {
      loadArticle(feedIds[currentIndex]);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [currentIndex, feedIds, loadArticle]);

  const goNext = useCallback(() => {
    if (currentIndex < feedIds.length - 1) {
      if (article) archiveArticle(article.id).catch(() => {});
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, feedIds.length, article]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  const hasNext = currentIndex < feedIds.length - 1;
  const hasPrev = currentIndex > 0;

  const gesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.3;
    })
    .onEnd((e) => {
      if (e.translationX < -100 && hasNext) {
        runOnJS(goNext)();
      } else if (e.translationX > 100 && hasPrev) {
        runOnJS(goPrev)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (configured === null || loading) {
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

  const isTweet = article?.source_type === "tweet";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {loadingArticle && !article ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : article ? (
          <GestureDetector gesture={gesture}>
            <Animated.View style={[{ flex: 1 }, animatedStyle]}>
              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Article header */}
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

                  {article.excerpt && !isTweet ? (
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
                  </View>
                </View>

                {/* Lead image */}
                {article.lead_image_url && !isTweet ? (
                  <Image
                    source={{ uri: article.lead_image_url }}
                    style={styles.leadImage}
                    resizeMode="cover"
                  />
                ) : null}

                {/* Content */}
                {isTweet ? (
                  <View style={styles.tweetBox}>
                    <Text style={styles.tweetContent}>
                      {article.text_content || article.content}
                    </Text>
                    {article.lead_image_url ? (
                      <Image
                        source={{ uri: article.lead_image_url }}
                        style={styles.tweetImage}
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>
                ) : segments.length > 0 ? (
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
    fontFamily: "Courier",
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  metaDot: { color: colors.textTertiary, fontSize: 12 },
  metaDate: {
    fontSize: 12,
    fontFamily: "Courier",
    color: colors.textTertiary,
  },
  title: {
    fontFamily: "System",
    fontSize: 28,
    lineHeight: 36,
    color: colors.text,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  excerpt: {
    fontFamily: "System",
    fontSize: 18,
    lineHeight: 26,
    color: colors.textSecondary,
  },
  author: {
    fontSize: 12,
    fontFamily: "Courier",
    color: colors.textTertiary,
  },
  readTime: {
    fontSize: 12,
    fontFamily: "Courier",
    color: colors.textTertiary,
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
  tappedIndicator: {
    position: "absolute",
    left: -8,
    top: 12,
    bottom: 12,
    width: 3,
    justifyContent: "center",
  },
  tappedDot: {
    width: 3,
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  tweetBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 20,
    gap: 16,
  },
  tweetContent: {
    fontFamily: "System",
    fontSize: 20,
    lineHeight: 30,
    color: colors.text,
  },
  tweetImage: {
    width: "100%",
    height: 200,
    borderRadius: 10,
  },
  plainText: {
    fontFamily: "System",
    fontSize: 18,
    lineHeight: 32,
    color: colors.text,
  },
  emptyTitle: {
    fontFamily: "System",
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
