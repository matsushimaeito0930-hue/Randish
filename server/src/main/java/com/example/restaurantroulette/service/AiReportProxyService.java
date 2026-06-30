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
import org.springframework.stereotype.Service;

@Service
public class AiReportProxyService {
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
      return statusReport("fallback");
    }

    if (endpoint == null || requestToken == null) {
      return statusReport("demo");
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

  private JsonNode generateWithGemini(String requestBody) {
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
        .put("text", buildGeminiPrompt(requestBody));

    ObjectNode generationConfig = body.putObject("generationConfig");
    generationConfig.put("temperature", 0.55);
    generationConfig.put("maxOutputTokens", 1800);
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
        return null;
      }
      return parseGeminiReport(response.body());
    } catch (IOException | InterruptedException error) {
      if (error instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
      return null;
    }
  }

  private JsonNode parseGeminiReport(String responseBody) {
    try {
      JsonNode response = objectMapper.readTree(responseBody);
      JsonNode parts = response.path("candidates").path(0).path("content").path("parts");
      if (!parts.isArray()) {
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
        return null;
      }
      JsonNode report = objectMapper.readTree(stripJsonFence(text));
      if (!report.isObject() || !hasMinimumReportContent(report)) {
        return null;
      }
      ObjectNode reportObject = report.deepCopy();
      reportObject.put("source", "gemini");
      if (!reportObject.hasNonNull("generatedAt") || reportObject.path("generatedAt").asText().isBlank()) {
        reportObject.put("generatedAt", Instant.now().toString());
      }
      return reportObject;
    } catch (IOException error) {
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

  private String buildGeminiPrompt(String requestBody) {
    return """
        You write Randish Premium monthly food reports.
        Return only valid JSON. Do not wrap it in markdown.
        Write every user-facing value in natural Japanese.
        The app is a restaurant roulette app, so use words like "gaisyoku", "omise erabi", and "chusen" instead of "draw".
        Keep numbers faithful to the input. Do not invent exact spending that is not implied by the input.
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
        """.formatted(requestBody);
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
