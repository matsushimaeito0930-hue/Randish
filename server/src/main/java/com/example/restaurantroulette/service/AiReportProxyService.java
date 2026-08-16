package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AiReportProxyService {
  private static final Logger logger = LoggerFactory.getLogger(AiReportProxyService.class);
  private static final int MAX_BODY_BYTES = 24_000;

  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final String endpoint;
  private final String requestToken;
  private final String geminiApiKey;
  private final String geminiModel;

  public AiReportProxyService(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
    this.httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(4))
        .build();
    this.endpoint = firstNonBlank(
        System.getProperty("AI_REPORT_ENDPOINT"),
        System.getenv("AI_REPORT_ENDPOINT"));
    this.requestToken = firstNonBlank(
        System.getProperty("AI_REPORT_REQUEST_TOKEN"),
        System.getenv("AI_REPORT_REQUEST_TOKEN"));
    this.geminiApiKey = firstNonBlank(
        System.getProperty("GEMINI_API_KEY"),
        System.getenv("GEMINI_API_KEY"));
    this.geminiModel = normalizeModel(firstNonBlank(
        System.getProperty("GEMINI_MODEL"),
        System.getenv("GEMINI_MODEL"),
        "gemini-2.5-flash"));
  }

  public JsonNode generate(JsonNode payload) {
    if (payload == null || !payload.isObject()) {
      throw new BadRequestException("AI report payload is required.");
    }

    String requestBody;
    try {
      requestBody = objectMapper.writeValueAsString(payload);
    } catch (IOException error) {
      throw new BadRequestException("AI report payload is invalid.");
    }

    if (requestBody.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
      throw new BadRequestException("AI report payload is too large.");
    }

    if (geminiApiKey != null) {
      JsonNode geminiReport = generateWithGemini(requestBody);
      if (geminiReport != null) {
        return geminiReport;
      }
      logger.warn("[RANDISH_AI] Gemini report generation failed; returning fallback. model={}", geminiModel);
      return statusReport("fallback");
    }

    if (endpoint == null || requestToken == null) {
      logger.warn("[RANDISH_AI] No AI backend configured (GEMINI_API_KEY / AI_REPORT_ENDPOINT missing); returning fallback.");
      return statusReport("fallback");
    }

    URI endpointUri;
    try {
      endpointUri = URI.create(endpoint);
    } catch (IllegalArgumentException error) {
      return statusReport("fallback");
    }

    HttpRequest request = HttpRequest.newBuilder(endpointUri)
        .timeout(Duration.ofSeconds(20))
        .header("Content-Type", "application/json")
        .header("x-randish-ai-report-token", requestToken)
        .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
        .build();

    try {
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        return statusReport("fallback");
      }
      JsonNode report = objectMapper.readTree(response.body());
      return report != null && report.isObject() ? report : statusReport("fallback");
    } catch (IOException | InterruptedException error) {
      if (error instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      return statusReport("fallback");
    }
  }

  /**
   * Selects one of the supplied candidate IDs using only aggregated food-history data.
   * Restaurant names and addresses are deliberately not required by this endpoint.
   */
  public JsonNode generateFoodRecommendation(JsonNode payload) {
    String requestBody = serializePayload(payload, "Food AI payload");
    JsonNode candidates = payload.path("candidates");
    if (!candidates.isArray() || candidates.isEmpty() || candidates.size() > 20) {
      throw new BadRequestException("Food AI candidates must contain between 1 and 20 items.");
    }
    if (geminiApiKey == null) {
      logger.warn("[RANDISH_FOOD_AI] GEMINI_API_KEY is missing; returning fallback.");
      return statusReport("fallback");
    }

    Set<String> allowedCandidateIds = new HashSet<>();
    candidates.forEach(candidate -> {
      String candidateId = candidate.path("candidateId").asText("").trim();
      if (!candidateId.isBlank()) {
        allowedCandidateIds.add(candidateId);
      }
    });
    if (allowedCandidateIds.isEmpty()) {
      throw new BadRequestException("Food AI candidate IDs are required.");
    }

    JsonNode recommendation = generateJsonWithGemini(buildFoodAiPrompt(requestBody), 1200);
    if (recommendation == null || !hasMinimumFoodRecommendation(recommendation, allowedCandidateIds)) {
      logger.warn("[RANDISH_FOOD_AI] Gemini recommendation was invalid; returning fallback. model={}", geminiModel);
      return statusReport("fallback");
    }
    return withGenerationMetadata(recommendation);
  }

  private JsonNode generateWithGemini(String requestBody) {
    JsonNode report = generateJsonWithGemini(buildGeminiPrompt(requestBody), 4096);
    if (report == null || !hasMinimumReportContent(report)) {
      logger.warn("[RANDISH_AI] Gemini JSON missing required report fields. model={}", geminiModel);
      return null;
    }
    return withGenerationMetadata(report);
  }

  private JsonNode generateJsonWithGemini(String prompt, int maxOutputTokens) {
    URI endpointUri;
    try {
      String encodedModel = URLEncoder.encode(geminiModel, StandardCharsets.UTF_8).replace("+", "%20");
      endpointUri = URI.create("https://generativelanguage.googleapis.com/v1beta/models/" + encodedModel + ":generateContent");
    } catch (IllegalArgumentException error) {
      return null;
    }

    ObjectNode body = objectMapper.createObjectNode();
    ArrayNode contents = body.putArray("contents");
    ObjectNode userContent = contents.addObject();
    userContent.put("role", "user");
    userContent.putArray("parts")
        .addObject()
        .put("text", prompt);

    ObjectNode generationConfig = body.putObject("generationConfig");
    generationConfig.put("temperature", 0.55);
    // Gemini 2.5 系は thinking が既定で有効で、思考トークンも maxOutputTokens を消費する。
    // 少ない上限のままだと思考だけで枠を使い切り、本文が空 (finishReason=MAX_TOKENS) になって
    // レポートが必ず fallback になるため、thinking を無効化しつつ出力枠を広げる。
    generationConfig.putObject("thinkingConfig").put("thinkingBudget", 0);
    generationConfig.put("maxOutputTokens", maxOutputTokens);
    generationConfig.put("responseMimeType", "application/json");

    String geminiRequestBody;
    try {
      geminiRequestBody = objectMapper.writeValueAsString(body);
    } catch (IOException error) {
      return null;
    }

    HttpRequest request = HttpRequest.newBuilder(endpointUri)
        .timeout(Duration.ofSeconds(25))
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", geminiApiKey)
        .POST(HttpRequest.BodyPublishers.ofString(geminiRequestBody, StandardCharsets.UTF_8))
        .build();

    try {
      HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
      if (response.statusCode() < 200 || response.statusCode() >= 300) {
        logger.warn("[RANDISH_AI] Gemini HTTP {} model={} body={}",
            response.statusCode(), geminiModel, abbreviate(response.body()));
        return null;
      }
      return parseGeminiJson(response.body());
    } catch (IOException | InterruptedException error) {
      if (error instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      logger.warn("[RANDISH_AI] Gemini request failed model={} error={}", geminiModel, error.toString());
      return null;
    }
  }

  private static String abbreviate(String value) {
    if (value == null) {
      return "";
    }
    String trimmed = value.strip();
    return trimmed.length() <= 500 ? trimmed : trimmed.substring(0, 500) + "...";
  }

  private JsonNode parseGeminiJson(String responseBody) {
    try {
      JsonNode response = objectMapper.readTree(responseBody);
      String finishReason = response.path("candidates").path(0).path("finishReason").asText("");
      JsonNode parts = response.path("candidates").path(0).path("content").path("parts");
      if (!parts.isArray()) {
        logger.warn("[RANDISH_AI] Gemini returned no content parts. finishReason={} usage={}",
            finishReason, response.path("usageMetadata"));
        return null;
      }
      String text = null;
      for (JsonNode part : parts) {
        String candidateText = part.path("text").asText(null);
        if (candidateText != null && !candidateText.isBlank()) {
          text = candidateText;
          break;
        }
      }
      if (text == null) {
        logger.warn("[RANDISH_AI] Gemini returned empty text. finishReason={} usage={}",
            finishReason, response.path("usageMetadata"));
        return null;
      }
      JsonNode result = objectMapper.readTree(stripJsonFence(text));
      if (!result.isObject()) {
        logger.warn("[RANDISH_AI] Gemini did not return a JSON object. finishReason={} text={}",
            finishReason, abbreviate(text));
        return null;
      }
      return result;
    } catch (IOException error) {
      logger.warn("[RANDISH_AI] Failed to parse Gemini response as JSON. error={} body={}",
          error.toString(), abbreviate(responseBody));
      return null;
    }
  }

  private boolean hasMinimumReportContent(JsonNode report) {
    return !report.path("summary").asText("").isBlank()
        && report.path("highlights").isArray()
        && !report.path("highlights").isEmpty()
        && report.path("recommendations").isArray()
        && !report.path("recommendations").isEmpty();
  }

  private boolean hasMinimumFoodRecommendation(JsonNode recommendation, Set<String> allowedCandidateIds) {
    String candidateId = recommendation.path("candidateId").asText("").trim();
    return allowedCandidateIds.contains(candidateId)
        && !recommendation.path("headline").asText("").isBlank()
        && !recommendation.path("reason").asText("").isBlank()
        && !recommendation.path("comparison").asText("").isBlank();
  }

  /**
   * 実在しない機能を勧めさせないための制約。
   *
   * <p>月次レポートが「RANDISHのクーポンを活用するのもいいかもしれません」と書いてきたことがある。
   * クーポンという機能は無い。読んだ人は探しにいって見つけられず、書いてあることを
   * 信じなくなる。何ができるアプリなのかを明示して、そこから外れた提案を禁じる。
   *
   * <p>機能を増やしたらここも増やすこと。ここに書いていない機能は、AIから見れば
   * 存在しないのと同じになる。
   */
  private static final String RANDISH_FEATURE_GUARDRAIL = """
      Randish can only do these things: pick a restaurant at random from search conditions
      (area, budget, distance, genre), keep a history of those picks, estimate monthly eating-out
      spending from that history, save shops to an album with photos, show a daily recommendation,
      and for Premium members filter by rating and open-now, use situation modes, and read this report.
      Never suggest a feature outside that list. In particular Randish has no coupons, no discounts,
      no points, no reservations, no delivery, no reviews the user can post, and no friend sharing.
      Suggest only actions the user can actually take today, either inside Randish as described above
      or in their own life such as cooking at home or setting a budget.
      """;

  private String buildGeminiPrompt(String requestBody) {
    return """
        You write Randish Premium monthly food reports.
        Return only valid JSON. Do not wrap it in markdown.
        Write every user-facing value in natural Japanese.
        The app is a restaurant roulette app, so use words like "gaisyoku", "omise erabi", and "chusen" instead of "draw".
        Keep numbers faithful to the input. Do not invent exact spending that is not implied by the input.
        estimatedSpend only covers the budgetSampleCount draws whose price was known, not all drawCount
        draws. When budgetSampleCount is smaller than drawCount, never present estimatedSpend as the
        month's total: say it covers budgetSampleCount of drawCount and that the rest had no price on
        record. Presenting a partial figure as the whole is the one thing that makes this report useless,
        because the reader compares it against what they actually spent and it is always too low.
        %s
        Required JSON fields:
        {
          "title": string,
          "summary": string,
          "mood": string,
          "highlights": string[5],
          "recommendations": string[3],
          "savingsTips": string[3],
          "nextAction": string,
          "closingNotes": string[5]
        }
        Tone: premium, warm, concise, specific, and useful enough that a user feels this was written for them.
        Input analytics JSON:
        %s
        """.formatted(RANDISH_FEATURE_GUARDRAIL, requestBody);
  }

  private String buildFoodAiPrompt(String requestBody) {
    return """
        You are Randish Premium's daily food recommendation assistant.
        Return only valid JSON and write all user-facing text in natural Japanese.
        Choose exactly one candidateId from the supplied candidates. Never create or alter an ID.
        The user gets one suggestion per day and chooses when to ask for it, so askedAt is the
        strongest signal in the input, not an afterthought. Read askedAt.mealSlot first and rule out
        anything that does not belong at that hour before weighing anything else:
        nobody wants yakiniku or sushi at nine in the morning, and a burger at midnight is not what
        they came for. Follow askedAt.mealSlotGuidance. If the only candidates left are a poor fit
        for the hour, pick the closest one and say honestly that it is not an obvious fit right now.
        Then use mealSlotHistory: what this person has actually chosen at this same hour in the past
        matters more than their overall monthly averages. If they have no history at this hour, say so
        rather than pretending to know their habit.
        Use currentMonth, previousMonth, preferences, ratings, distance and price information only when present.
        Spending values are estimates, so always describe them as estimated spending.
        Do not claim that the user actually visited or paid unless the input explicitly says so.
        Candidate names and addresses are intentionally omitted. Do not invent a restaurant name, address, menu, facility or opening status.
        Prefer a useful balance between the user's established tastes, budget, distance and a small amount of discovery.
        %s
        Required JSON fields:
        {
          "candidateId": string,
          "headline": string,
          "reason": string,
          "comparison": string
        }
        headline: a short invitation such as "今日はこの一店、どうですか？".
        reason: 3-4 sentences, roughly 100-160 Japanese characters. Lead with why this suits the hour
          they asked at, in plain terms a person would actually use ("朝に胃が重くならない" rather than
          "朝食に適しています"). Then add what you read from their own record: what they tend to pick at
          this hour, where the estimated price falls against their usual spending, how far it is.
          Every clause must trace back to a field in the input. If the input is thin, say plainly what
          is not known yet rather than padding with generic praise.
        comparison: one concise sentence comparing this month with last month. If either month has no data, say that the preference is still being learned without inventing numbers.
        Input JSON:
        %s
        """.formatted(RANDISH_FEATURE_GUARDRAIL, requestBody);
  }

  private String serializePayload(JsonNode payload, String label) {
    if (payload == null || !payload.isObject()) {
      throw new BadRequestException(label + " is required.");
    }
    try {
      String requestBody = objectMapper.writeValueAsString(payload);
      if (requestBody.getBytes(StandardCharsets.UTF_8).length > MAX_BODY_BYTES) {
        throw new BadRequestException(label + " is too large.");
      }
      return requestBody;
    } catch (IOException error) {
      throw new BadRequestException(label + " is invalid.");
    }
  }

  private ObjectNode withGenerationMetadata(JsonNode value) {
    ObjectNode result = value.deepCopy();
    result.put("source", "gemini");
    if (!result.hasNonNull("generatedAt") || result.path("generatedAt").asText().isBlank()) {
      result.put("generatedAt", Instant.now().toString());
    }
    return result;
  }

  private String stripJsonFence(String text) {
    String trimmed = text.trim();
    if (trimmed.startsWith("```")) {
      trimmed = trimmed.replaceFirst("^```(?:json)?\\s*", "");
      trimmed = trimmed.replaceFirst("\\s*```$", "");
    }
    return trimmed.trim();
  }

  private ObjectNode statusReport(String source) {
    ObjectNode report = objectMapper.createObjectNode();
    report.put("source", source);
    return report;
  }

  private static String normalizeModel(String model) {
    if (model == null || model.isBlank()) {
      return "gemini-2.5-flash";
    }
    String trimmed = model.trim();
    return trimmed.startsWith("models/") ? trimmed.substring("models/".length()) : trimmed;
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }
}
