package com.example.restaurantroulette;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class RestaurantRouletteApplication {

  public static void main(String[] args) {
    loadLocalEnvironment();
    configureDatasourceFromDatabaseUri();
    SpringApplication.run(RestaurantRouletteApplication.class, args);
  }

  private static void loadLocalEnvironment() {
    for (Path path : List.of(Path.of(".env.local"), Path.of("..", ".env.local"), Path.of(".env"))) {
      if (!Files.exists(path)) {
        continue;
      }
      try {
        Files.readAllLines(path, StandardCharsets.UTF_8).stream()
            .map(String::trim)
            .filter(line -> !line.isBlank())
            .filter(line -> !line.startsWith("#"))
            .filter(line -> line.contains("="))
            .forEach(RestaurantRouletteApplication::setSystemPropertyIfAbsent);
      } catch (IOException ignored) {
      }
    }
  }

  private static void setSystemPropertyIfAbsent(String line) {
    String key = line.substring(0, line.indexOf('=')).trim();
    String value = trimConfigValue(line.substring(line.indexOf('=') + 1));
    if (!key.isBlank() && System.getProperty(key) == null && System.getenv(key) == null) {
      System.setProperty(key, value);
    }
  }

  private static void configureDatasourceFromDatabaseUri() {
    if (System.getProperty("SPRING_DATASOURCE_URL") != null || System.getenv("SPRING_DATASOURCE_URL") != null) {
      return;
    }

    String databaseUri = firstPresent(
        System.getProperty("RANDISH_DATABASE_URI"),
        System.getenv("RANDISH_DATABASE_URI"),
        System.getProperty("SUPABASE_DATABASE_URI"),
        System.getenv("SUPABASE_DATABASE_URI"));
    if (databaseUri == null || databaseUri.isBlank()) {
      return;
    }

    URI uri = URI.create(databaseUri);
    String userInfo = uri.getRawUserInfo();
    if (userInfo == null || !userInfo.contains(":")) {
      throw new IllegalArgumentException("RANDISH_DATABASE_URI must include user and password.");
    }

    String user = decode(userInfo.substring(0, userInfo.indexOf(':')));
    String password = decode(userInfo.substring(userInfo.indexOf(':') + 1));
    String jdbcUrl = "jdbc:postgresql://%s:%d%s".formatted(uri.getHost(), resolvePort(uri), uri.getPath());

    System.setProperty("SPRING_DATASOURCE_URL", jdbcUrl);
    System.setProperty("SPRING_DATASOURCE_USERNAME", user);
    System.setProperty("SPRING_DATASOURCE_PASSWORD", password);
  }

  private static int resolvePort(URI uri) {
    return uri.getPort() == -1 ? 5432 : uri.getPort();
  }

  private static String firstPresent(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
  }

  private static String decode(String value) {
    return URLDecoder.decode(value, StandardCharsets.UTF_8);
  }

  private static String trimConfigValue(String value) {
    return value.trim().replaceFirst("^['\"]", "").replaceFirst("['\"]$", "");
  }
}
