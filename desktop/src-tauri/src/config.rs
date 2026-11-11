pub const LOG_FILENAME_PREFIX: &str = "log";
pub const LOG_FILENAME_SUFFIX: &str = ".txt";
/// Warnings and errors only: debug lines carry file paths, URLs and device names (IT review M8).
/// Support can still ask for more with RUST_LOG=vibe=debug.
pub const DEFAULT_LOG_DIRECTIVE: &str = "vibe=WARN";
pub const STORE_FILENAME: &str = "app_config.json";
pub const DOCUMENTS_SUBFOLDER: &str = "Vibe";
