# Supabase email OTP template

RANDISH uses one authentication method for both login and registration: a one-time code entered in the app.
The production `Magic link or OTP` template must contain `{{ .Token }}` and must not contain
`{{ .ConfirmationURL }}` or `{{ .TokenHash }}`.

Subject:

```text
【RANDISH】認証コード
```

Body:

```html
<div style="margin:0;padding:32px 16px;background:#fffaf5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f1b18;">
  <div style="max-width:520px;margin:0 auto;padding:32px 28px;background:#ffffff;border:1px solid #eee2d8;border-radius:20px;">
    <p style="margin:0 0 20px;font-size:24px;font-weight:900;letter-spacing:0.04em;color:#171411;">RANDISH</p>
    <h2 style="margin:0 0 16px;font-size:24px;line-height:1.4;color:#171411;">認証コード</h2>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.8;color:#665d56;">RANDISHのログイン・会員登録画面に、次のコードを入力してください。</p>
    <p style="margin:0 0 24px;padding:16px;border-radius:14px;background:#fff6f0;text-align:center;font-size:30px;font-weight:900;letter-spacing:0.18em;color:#ef552e;">{{ .Token }}</p>
    <p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#8a817a;">このコードは一度だけ使用できます。コードを他人に教えたり、このメールを転送したりしないでください。</p>
    <p style="margin:0;font-size:12px;line-height:1.7;color:#8a817a;">ご自身で操作していない場合は、このメールを破棄してください。</p>
  </div>
</div>
```

Recommended production settings:

- Email OTP expiration: 600 seconds
- Minimum interval between OTP requests: 60 seconds
- Login requests: `create_user=false`
- Registration requests: `create_user=true`
