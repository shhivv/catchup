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
import { useLocalSearchParams, useRouter } from "expo-router";
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
  getArticle,
  getFeed,
  markRead,
  archiveArticle,
  recordInterest,
  Article,
  Segment,
} from "../../lib/api";
import { colors, spacing } from "../../lib/theme";

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
    fontFamily: "Georgia",
    fontSize: 18,
    lineHeight: 32,
  },
  p: { marginBottom: 0, marginTop: 0 },
  a: { color: colors.accent, textDecorationLine: "underline" as const },
  h1: { fontFamily: "System", fontWeight: "600" as const, fontSize: 24, color: colors.text },
  h2: { fontFamily: "System", fontWeight: "600" as const, fontSize: 20, color: colors.text },
  h3: { fontFamily: "System", fontWeight: "600" as const, fontSize: 18, color: colors.text },
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
  code: { fontFamily: "Courier", fontSize: 14, backgroundColor: colors.bgRaised },
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

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [article, setArticle] = useState<Article | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [tappedParagraphs, setTappedParagraphs] = useState<Set<number>>(
    new Set()
  );
  const [loading, setLoading] = useState(true);
  const [feedIds, setFeedIds] = useState<{ id: number; title: string }[]>([]);

  const translateX = useSharedValue(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [art, feed] = await Promise.all([
          getArticle(parseInt(id)),
          getFeed("unread", 1, 100),
        ]);
        setArticle(art);
        setSegments(art.segments || []);
        setTappedParagraphs(new Set(art.tappedParagraphs || []));
        setFeedIds(
          feed.articles.map((a: Article) => ({ id: a.id, title: a.title }))
        );
        markRead(parseInt(id)).catch(() => {});
      } catch {}
      setLoading(false);
    }
    load();
  }, [id]);

  const currentIndex = feedIds.findIndex((item) => item.id === parseInt(id));
  const prevId = currentIndex > 0 ? feedIds[currentIndex - 1] : null;
  const nextId =
    currentIndex < feedIds.length - 1 ? feedIds[currentIndex + 1] : null;

  const navigateTo = useCallback(
    (targetId: number) => {
      router.replace({
        pathname: "/read/[id]",
        params: { id: targetId.toString() },
      });
    },
    [router]
  );

  const handleSwipeLeft = useCallback(() => {
    if (nextId) {
      archiveArticle(parseInt(id)).catch(() => {});
      navigateTo(nextId.id);
    }
  }, [nextId, id, navigateTo]);

  const handleSwipeRight = useCallback(() => {
    if (prevId) navigateTo(prevId.id);
  }, [prevId, navigateTo]);

  const gesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX * 0.3;
    })
    .onEnd((e) => {
      if (e.translationX < -100 && nextId) {
        runOnJS(handleSwipeLeft)();
      } else if (e.translationX > 100 && prevId) {
        runOnJS(handleSwipeRight)();
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const contentWidth = width - spacing.lg * 2;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!article) {
    return (
      <View style={styles.center}>
        <Text
          style={{
            fontFamily: "Georgia",
            fontSize: 18,
            color: colors.textSecondary,
          }}
        >
          article not found
        </Text>
      </View>
    );
  }

  const isTweet = article.source_type === "tweet";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ feed</Text>
          </Pressable>
          <View style={styles.navRow}>
            {prevId ? (
              <Pressable
                onPress={() => navigateTo(prevId.id)}
                style={styles.navBtn}
              >
                <Text style={styles.navBtnText}>‹</Text>
              </Pressable>
            ) : null}
            {feedIds.length > 0 ? (
              <Text style={styles.navCount}>
                {currentIndex + 1}/{feedIds.length}
              </Text>
            ) : null}
            {nextId ? (
              <Pressable
                onPress={() => navigateTo(nextId.id)}
                style={styles.navBtn}
              >
                <Text style={styles.navBtnText}>›</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <GestureDetector gesture={gesture}>
          <Animated.View style={[{ flex: 1 }, animatedStyle]}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Swipe hint */}
              {nextId ? (
                <Text style={styles.swipeHint}>
                  swipe to skip · double-tap a paragraph to save interest
                </Text>
              ) : null}

              {/* Article header */}
              <View style={styles.articleHeader}>
                <View style={styles.metaRow}>
                  {article.site_name ? (
                    <Text style={styles.siteName}>{article.site_name}</Text>
                  ) : null}
                  {article.published_date ? (
                    <>
                      <Text style={styles.metaDot}>·</Text>
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
                <Text style={styles.plainText}>{article.text_content}</Text>
              )}

              {/* Next article teaser */}
              {nextId ? (
                <Pressable
                  style={styles.nextTeaser}
                  onPress={() => navigateTo(nextId.id)}
                >
                  <Text style={styles.nextLabel}>UP NEXT</Text>
                  <Text style={styles.nextTitle}>{nextId.title}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
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
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    height: 44,
  },
  backBtn: { paddingVertical: 8, paddingRight: 12 },
  backText: {
    fontSize: 15,
    color: colors.textTertiary,
    fontFamily: "Courier",
  },
  navRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  navBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  navBtnText: { fontSize: 20, color: colors.textTertiary },
  navCount: {
    fontSize: 11,
    fontFamily: "Courier",
    color: colors.textTertiary,
  },
  swipeHint: {
    fontSize: 11,
    fontFamily: "Courier",
    color: colors.textTertiary,
    opacity: 0.5,
    textAlign: "center",
    marginBottom: spacing.md,
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
    fontFamily: "Georgia",
    fontSize: 28,
    lineHeight: 36,
    color: colors.text,
    letterSpacing: -0.3,
  },
  excerpt: {
    fontFamily: "Georgia",
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
    fontFamily: "Georgia",
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
    fontFamily: "Georgia",
    fontSize: 18,
    lineHeight: 32,
    color: colors.text,
  },
  nextTeaser: {
    marginTop: 40,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  nextLabel: {
    fontSize: 11,
    fontFamily: "Courier",
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  nextTitle: {
    fontFamily: "Georgia",
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
});
