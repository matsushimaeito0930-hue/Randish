package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthAuthorizeResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthSessionRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest;
import com.example.restaurantroulette.service.AuthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  @PostMapping("/register")
  public AuthResponse register(@RequestBody UserCreateRequest request) {
    return authService.register(request);
  }

  @PostMapping("/login")
  public AuthResponse login(@RequestBody UserLoginRequest request) {
    return authService.login(request);
  }

  @GetMapping("/oauth/{provider}/authorize")
  public OAuthAuthorizeResponse oauthAuthorize(
      @PathVariable String provider,
      @RequestParam(required = false) String redirectTo) {
    return authService.createOAuthAuthorizeUrl(provider, redirectTo);
  }

  @PostMapping("/oauth/session")
  public AuthResponse oauthSession(@RequestBody OAuthSessionRequest request) {
    return authService.loginWithOAuthSession(request);
  }
}
