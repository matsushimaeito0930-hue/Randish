package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.stereotype.Service;

@Service
public class AiReportProxyService {
  private static final int MAX_BODY_BYTES = 24_000;

  private final ObjectMapper objectMapper;
  private final HttpClient httpClient;
  private final String endpoint;
  private final String requestToken;

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

  private ObjectNode statusReport(String source) {
    ObjectNode report = objectMapper.createObjectNode();
    report.put("source", source);
    return report;
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
