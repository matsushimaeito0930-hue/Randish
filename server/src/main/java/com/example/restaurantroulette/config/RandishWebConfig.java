package com.example.restaurantroulette.config;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class RandishWebConfig implements WebMvcConfigurer {
  private final String allowedOrigins;

  public RandishWebConfig(@Value("${randish.cors.allowed-origins:}") String allowedOrigins) {
    this.allowedOrigins = allowedOrigins;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    String[] origins = Arrays.stream(allowedOrigins.split(","))
        .map(String::trim)
        .filter(origin -> !origin.isBlank())
        .toArray(String[]::new);
    if (origins.length == 0) {
      return;
    }

    registry.addMapping("/api/**")
        .allowedOrigins(origins)
        .allowedMethods("GET", "POST", "DELETE", "OPTIONS")
        .allowedHeaders("Authorization", "Content-Type")
        .maxAge(3600);
  }
}
