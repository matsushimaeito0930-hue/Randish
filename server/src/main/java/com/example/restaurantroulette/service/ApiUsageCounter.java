package com.example.restaurantroulette.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

public class ApiUsageCounter {
  private static final int DEFAULT_LIMIT = 1000;
  private static final List<Path> CONFIG_FILES = List.of(
      Path.of(".env.local"),
      Path.of("..", ".env.local"),
      Path.of("server", ".env.local"),
      Path.of("..", "server", ".env.local"),
      Path.of(".env"),
      Path.of("..", ".env"),
      Path.of("server", ".env"),
      Path.of("..", "server", ".env"));

  private final String key;
  private final String name;
  private final String limitKey;
  private final int fallbackLimit;
  private final AtomicInteger usedCount = new AtomicInteger();

  public ApiUsageCounter(String key, String name, String limitKey) {
    this(key, name, limitKey, DEFAULT_LIMIT);
  }

  public ApiUsageCounter(String key, String name, String limitKey, int fallbackLimit) {
    this.key = key;
    this.name = name;
    this.limitKey = limitKey;
    this.fallbackLimit = fallbackLimit;
  }

  public void increment() {
    usedCount.incrementAndGet();
  }

  public int usedCount() {
    return usedCount.get();
  }

  public int limitCount() {
    return resolveLimit(limitKey).orElse(fallbackLimit);
  }

  public Map<String, Object> snapshot(boolean available) {
    int used = usedCount();
    int limit = Math.max(1, limitCount());
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("key", key);
    result.put("name", name);
    result.put("used", used);
    result.put("limit", limit);
    result.put("remaining", Math.max(0, limit - used));
    result.put("display", used + "/" + limit);
    result.put("available", available);
    return result;
  }

  private Optional<Integer> resolveLimit(String key) {
    String envValue = System.getenv(key);
    if (envValue != null && !envValue.isBlank()) {
      return parsePositiveInt(envValue);
    }
    for (Path path : CONFIG_FILES) {
      Optional<Integer> value = readConfigValue(path, key).flatMap(this::parsePositiveInt);
      if (value.isPresent()) {
        return value;
      }
    }
    return Optional.empty();
  }

  private Optional<String> readConfigValue(Path path, String key) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }
    try {
      return Files.readAllLines(path, StandardCharsets.UTF_8).stream()
          .map(String::trim)
          .filter(line -> !line.isBlank())
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.startsWith(key + "="))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(value -> value.trim().replaceAll("^['\"]|['\"]$", ""))
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException exception) {
      return Optional.empty();
    }
  }

  private Optional<Integer> parsePositiveInt(String value) {
    try {
      int parsed = Integer.parseInt(value.trim());
      return parsed > 0 ? Optional.of(parsed) : Optional.empty();
    } catch (NumberFormatException exception) {
      return Optional.empty();
    }
  }
}
