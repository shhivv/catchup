import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  StyleSheet,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getFeed, isConfigured, addArticle, Article } from "../lib/api";
import { colors, spacing } from "../lib/theme";

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function readingTime(wordCount: number): string {
  return `${Math.max(1, Math.round(wordCount / 238))} min`;
}

const captureLabels: Record<string, string> = {
  auto: "unfinished",
  manual: "saved",
  bookmark: "bookmarked",
  suggested: "suggested",
};

type Filter = "unread" | "read" | "all";

function HeroCard({
  article,
  onPress,
}: {
  article: Article;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.heroCard} onPress={onPress}>
      {article.lead_image_url ? (
        <Image
          source={{ uri: article.lead_image_url }}
          style={styles.heroImage}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.heroContent}>
        <View style={styles.metaRow}>
          {article.site_name ? (
            <Text style={styles.metaSite}>{article.site_name}</Text>
          ) : null}
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaTime}>{timeAgo(article.created_at)}</Text>
          <Text style={styles.metaCapture}>
            {captureLabels[article.capture_method] || article.capture_method}
          </Text>
        </View>
        <Text style={styles.heroTitle}>{article.title}</Text>
        {article.excerpt ? (
          <Text style={styles.heroExcerpt} numberOfLines={2}>
            {article.excerpt}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {article.author ? (
            <Text style={styles.metaAuthor}>{article.author}</Text>
          ) : null}
          {article.word_count > 0 ? (
            <Text style={styles.metaTime}>
              {readingTime(article.word_count)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ArticleCard({
  article,
  onPress,
}: {
  article: Article;
  onPress: () => void;
}) {
  if (article.source_type === "tweet") {
    return (
      <Pressable style={styles.card} onPress={onPress}>
        <View style={styles.cardInner}>
          <View style={styles.metaRow}>
            <Text style={[styles.metaSite, { color: colors.textTertiary }]}>
              {article.author || "tweet"}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaTime}>{timeAgo(article.created_at)}</Text>
          </View>
          <Text style={styles.tweetText} numberOfLines={4}>
            {article.text_content || article.excerpt || article.title}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={styles.cardTextArea}>
          <View style={styles.metaRow}>
            {article.site_name ? (
              <Text style={styles.metaSite}>{article.site_name}</Text>
            ) : null}
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaTime}>{timeAgo(article.created_at)}</Text>
            <Text style={styles.metaCapture}>
              {captureLabels[article.capture_method] || article.capture_method}
            </Text>
          </View>
          <Text style={styles.cardTitle} numberOfLines={3}>
            {article.title}
          </Text>
          {article.excerpt ? (
            <Text style={styles.cardExcerpt} numberOfLines={2}>
              {article.excerpt}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {article.author ? (
              <Text style={styles.metaAuthor}>{article.author}</Text>
            ) : null}
            {article.word_count > 0 ? (
              <Text style={styles.metaTime}>
                {readingTime(article.word_count)}
              </Text>
            ) : null}
          </View>
        </View>
        {article.lead_image_url ? (
          <Image
            source={{ uri: article.lead_image_url }}
            style={styles.cardThumb}
            resizeMode="cover"
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function FeedScreen() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("unread");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  useEffect(() => {
    isConfigured().then((ok) => {
      setConfigured(ok);
      if (!ok) router.replace("/settings");
    });
  }, [router]);

  const fetchArticles = useCallback(async () => {
    try {
      const data = await getFeed(filter);
      setArticles(data.articles);
    } catch {
      // silently fail
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (configured) {
      setLoading(true);
      fetchArticles();
    }
  }, [configured, fetchArticles]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchArticles();
    setRefreshing(false);
  }, [fetchArticles]);

  async function handleAdd() {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      await addArticle(addUrl.trim());
      setAddUrl("");
      setShowAdd(false);
      fetchArticles();
    } catch {}
    setAdding(false);
  }

  if (configured === null || (configured && loading && articles.length === 0)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "unread", label: "unread" },
    { key: "read", label: "read" },
    { key: "all", label: "all" },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>catchup</Text>
        <View style={styles.headerRight}>
          {filters.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterBtn,
                filter === f.key && styles.filterBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === f.key && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setShowAdd(!showAdd)}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>+</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/settings")}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {/* Add URL bar */}
      {showAdd ? (
        <View style={styles.addBar}>
          <TextInput
            style={styles.addInput}
            value={addUrl}
            onChangeText={setAddUrl}
            placeholder="paste a url..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onSubmitEditing={handleAdd}
            autoFocus
          />
          <Pressable
            style={styles.addSubmit}
            onPress={handleAdd}
            disabled={adding}
          >
            <Text style={styles.addSubmitText}>
              {adding ? "..." : "add"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Feed */}
      <FlatList
        data={articles}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>nothing here yet</Text>
            <Text style={styles.emptySubtitle}>
              articles you don't finish reading will appear here
            </Text>
          </View>
        }
        renderItem={({ item, index }) =>
          index === 0 && item.lead_image_url ? (
            <HeroCard
              article={item}
              onPress={() =>
                router.push({
                  pathname: "/read/[id]",
                  params: { id: item.id.toString() },
                })
              }
            />
          ) : (
            <ArticleCard
              article={item}
              onPress={() =>
                router.push({
                  pathname: "/read/[id]",
                  params: { id: item.id.toString() },
                })
              }
            />
          )
        }
      />
    </SafeAreaView>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    fontFamily: "Georgia",
    fontSize: 20,
    color: colors.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterBtnActive: {
    backgroundColor: colors.bgActive,
  },
  filterText: {
    fontSize: 12,
    fontFamily: "Courier",
    color: colors.textTertiary,
  },
  filterTextActive: {
    color: colors.text,
  },
  addBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  addBtnText: {
    fontSize: 18,
    color: colors.textTertiary,
  },
  addBar: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  addInput: {
    flex: 1,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  addSubmit: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addSubmitText: {
    fontSize: 12,
    fontFamily: "Courier",
    color: colors.textSecondary,
  },
  list: {
    padding: spacing.md,
    gap: 12,
  },
  heroCard: {
    backgroundColor: colors.bgRaised,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  heroImage: {
    width: "100%",
    height: 180,
  },
  heroContent: {
    padding: spacing.md,
    gap: 8,
  },
  heroTitle: {
    fontFamily: "Georgia",
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
  },
  heroExcerpt: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.bgRaised,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  cardRow: {
    flexDirection: "row",
  },
  cardTextArea: {
    flex: 1,
    padding: spacing.md,
    gap: 6,
  },
  cardTitle: {
    fontFamily: "Georgia",
    fontSize: 17,
    lineHeight: 22,
    color: colors.text,
  },
  cardExcerpt: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  cardThumb: {
    width: 100,
    alignSelf: "stretch",
  },
  cardInner: {
    padding: spacing.md,
    gap: 8,
  },
  tweetText: {
    fontFamily: "Georgia",
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaSite: {
    fontSize: 11,
    fontFamily: "Courier",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaDot: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  metaTime: {
    fontSize: 11,
    fontFamily: "Courier",
    color: colors.textTertiary,
  },
  metaCapture: {
    fontSize: 10,
    fontFamily: "Courier",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaAuthor: {
    fontSize: 11,
    fontFamily: "Courier",
    color: colors.textTertiary,
  },
  empty: {
    paddingVertical: 80,
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: "Georgia",
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
