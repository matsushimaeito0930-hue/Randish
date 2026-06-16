package com.example.restaurantroulette.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class RandishRateLimitFilter extends OncePerRequestFilter {
  private final ConcurrentHashMap<String, RequestCounter> counters = new ConcurrentHashMap<>();
  private final boolean enabled;
  private final int apiLimit;
  private final int authLimit;
  private final int photoLimit;

  public RandishRateLimitFilter(
      @Value("${randish.rate-limit.enabled:true}") boolean enabled,
      @Value("${randish.rate-limit.api-per-minute:180}") int apiLimit,
      @Value("${randish.rate-limit.auth-per-minute:20}") int authLimit,
      @Value("${randish.rate-limit.photo-per-minute:60}") int photoLimit) {
    this.enabled = enabled;
    this.apiLimit = Math.max(1, apiLimit);
    this.authLimit = Math.max(1, authLimit);
    this.photoLimit = Math.max(1, photoLimit);
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain filterChain) throws ServletException, IOException {
    if (!enabled || !request.getRequestURI().startsWith("/api/")) {
      filterChain.doFilter(request, response);
      return;
    }

    String bucket = bucketFor(request.getRequestURI());
    int limit = limitFor(bucket);
    long window = System.currentTimeMillis() / 60_000L;
    String key = "%s|%s".formatted(request.getRemoteAddr(), bucket);
    if (!counters.computeIfAbsent(key, ignored -> new RequestCounter()).allow(window, limit)) {
      response.setStatus(429);
      response.setContentType(MediaType.APPLICATION_JSON_VALUE);
      response.getWriter().write("{\"code\":\"RATE_LIMITED\",\"message\":\"Too many requests.\",\"details\":[]}");
      return;
    }

    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    filterChain.doFilter(request, response);
  }

  private String bucketFor(String path) {
    if (path.startsWith("/api/auth/")) {
      return "auth";
    }
    if (path.startsWith("/api/google-places/photos")) {
      return "photo";
    }
    return "api";
  }

  private int limitFor(String bucket) {
    return switch (bucket) {
      case "auth" -> authLimit;
      case "photo" -> photoLimit;
      default -> apiLimit;
    };
  }

  private static class RequestCounter {
    private long window;
    private int count;

    synchronized boolean allow(long currentWindow, int limit) {
      if (window != currentWindow) {
        window = currentWindow;
        count = 0;
      }
      count++;
      return count <= limit;
    }
  }
}
