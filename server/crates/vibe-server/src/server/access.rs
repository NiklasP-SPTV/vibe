//! Who may talk to the engine (IT review M6).
//!
//! The engine listens on loopback with a random port, so the network cannot reach it, but every
//! local process and, through DNS rebinding, any website could. Two checks close that:
//!
//! - The Host header must name this machine. A rebinding page sends its own host name there.
//! - When the app starts the engine it passes a random key in `VIBE_SERVER_TOKEN`; every request
//!   then needs `Authorization: Bearer <key>`. `/health` and the API description stay open so a
//!   caller can tell "off" from "not allowed"; they say nothing about models or files.
//!
//! Without `VIBE_SERVER_TOKEN` (a bare `vibe-server serve` from a terminal) only the host check
//! applies, as before.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

pub const TOKEN_ENV: &str = "VIBE_SERVER_TOKEN";

#[derive(Clone, Default)]
pub struct Access {
    token: Option<String>,
    /// Only checked when the engine listens on loopback; `--host 0.0.0.0` is a deliberate opt-out.
    check_host: bool,
}

impl Access {
    pub fn from_env(bind_host: &str) -> Self {
        let token = std::env::var(TOKEN_ENV).ok().filter(|token| !token.is_empty());
        Self {
            token,
            check_host: is_loopback(bind_host),
        }
    }

    fn allows(&self, path: &str, host: Option<&str>, authorization: Option<&str>) -> Result<(), StatusCode> {
        if self.check_host && !host.is_some_and(is_local_host_header) {
            return Err(StatusCode::MISDIRECTED_REQUEST);
        }
        if is_public(path) {
            return Ok(());
        }
        if let Some(token) = &self.token {
            let presented = authorization.and_then(|value| value.strip_prefix("Bearer ")).unwrap_or("");
            if !constant_time_eq(presented.as_bytes(), token.as_bytes()) {
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
        Ok(())
    }
}

pub async fn guard(State(access): State<Access>, request: Request<Body>, next: Next) -> Response {
    let host = request.headers().get(header::HOST).and_then(|value| value.to_str().ok());
    let authorization = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());
    match access.allows(request.uri().path(), host, authorization) {
        Ok(()) => next.run(request).await,
        Err(status) => (status, "request refused by vibe-server access check").into_response(),
    }
}

/// Paths without data: the health check and the API description, which the settings page opens
/// in a browser that has no key.
fn is_public(path: &str) -> bool {
    path == "/health" || path == "/openapi.json" || path == "/docs" || path.starts_with("/docs/")
}

fn is_loopback(bind_host: &str) -> bool {
    matches!(bind_host, "127.0.0.1" | "localhost" | "::1" | "[::1]")
}

/// `127.0.0.1:5299`, `localhost`, `[::1]:80`: the name part must be this machine.
fn is_local_host_header(host: &str) -> bool {
    let name = if let Some(rest) = host.strip_prefix('[') {
        rest.split(']').next().map(|inner| format!("[{inner}]")).unwrap_or_default()
    } else {
        host.rsplit_once(':').map_or(host, |(name, _)| name).to_string()
    };
    matches!(name.to_ascii_lowercase().as_str(), "127.0.0.1" | "localhost" | "[::1]")
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_token() -> Access {
        Access {
            token: Some("secret".into()),
            check_host: true,
        }
    }

    #[test]
    fn a_foreign_host_name_is_refused() {
        let access = with_token();
        assert_eq!(
            access.allows("/v1/models", Some("evil.example:5299"), Some("Bearer secret")),
            Err(StatusCode::MISDIRECTED_REQUEST)
        );
        assert_eq!(access.allows("/health", None, None), Err(StatusCode::MISDIRECTED_REQUEST));
    }

    #[test]
    fn local_host_names_pass() {
        for host in ["127.0.0.1:5299", "localhost:1", "LOCALHOST", "[::1]:80", "127.0.0.1"] {
            assert!(is_local_host_header(host), "{host}");
        }
        for host in ["127.0.0.1.evil.example", "localhost.evil.example:80", "[::2]:80", ""] {
            assert!(!is_local_host_header(host), "{host}");
        }
    }

    #[test]
    fn requests_need_the_key_except_health() {
        let access = with_token();
        let host = Some("127.0.0.1:5299");
        assert_eq!(access.allows("/health", host, None), Ok(()));
        assert_eq!(access.allows("/docs/index.html", host, None), Ok(()));
        assert_eq!(access.allows("/docs-private", host, None), Err(StatusCode::UNAUTHORIZED));
        assert_eq!(
            access.allows("/v1/models/metadata", host, None),
            Err(StatusCode::UNAUTHORIZED)
        );
        assert_eq!(
            access.allows("/v1/models/metadata", host, Some("Bearer wrong!")),
            Err(StatusCode::UNAUTHORIZED)
        );
        assert_eq!(access.allows("/v1/models/metadata", host, Some("Bearer secret")), Ok(()));
    }

    #[test]
    fn without_a_key_only_the_host_is_checked() {
        let access = Access {
            token: None,
            check_host: true,
        };
        assert_eq!(access.allows("/v1/models", Some("localhost:9"), None), Ok(()));
        let open = Access {
            token: None,
            check_host: false,
        };
        assert_eq!(open.allows("/v1/models", Some("gpu-box:9"), None), Ok(()));
    }
}
