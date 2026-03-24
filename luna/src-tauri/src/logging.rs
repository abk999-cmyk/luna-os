use std::fs;
use tracing_subscriber::{EnvFilter, fmt, prelude::*};

pub fn init_logging(log_dir: &str) {
    // Ensure log directory exists
    fs::create_dir_all(log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(log_dir, "luna.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep the guard alive for the lifetime of the program
    // by leaking it (it's fine — it lives for the entire process)
    std::mem::forget(_guard);

    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("luna_lib=info,warn")),
        )
        .with(
            fmt::layer()
                .with_target(true)
                .with_thread_ids(false)
                .json()
                .with_writer(non_blocking),
        )
        .with(
            fmt::layer()
                .with_target(false)
                .compact()
                .with_writer(std::io::stderr),
        )
        .init();
}
