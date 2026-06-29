package com.example.restaurantroulette.config;

import java.util.Arrays;
import java.util.stream.Stream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class RandishWebConfig implements WebMvcConfigurer {
  private static final String[] DEV_ORIGIN_PATTERNS = {
      "http://localhost:*",
      "http://127.0.0.1:*",
      "http://192.168.*:*",
      "http://10.*:*",
      "http://172.*:*"
  };

  private final String allowedOrigins;

  public RandishWebConfig(@Value("${randish.cors.allowed-origins:}") String allowedOrigins) {
    this.allowedOrigins = allowedOrigins;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    String[] originPatterns = Stream.concat(
            Arrays.stream(allowedOrigins.split(",")),
            Arrays.stream(DEV_ORIGIN_PATTERNS))
        .map(String::trim)
        .filter(origin -> !origin.isBlank())
        .distinct()
        .toArray(String[]::new);
    if (originPatterns.length == 0) {
      return;
    }

    registry.addMapping("/api/**")
        .allowedOriginPatterns(originPatterns)
        .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
        .allowedHeaders("Authorization", "Content-Type", "X-Randish-Admin-Password")
        .maxAge(3600);
  }
}
