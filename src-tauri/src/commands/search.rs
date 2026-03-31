use serde::{Deserialize, Serialize};
use std::fs;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize)]
pub struct FileMatch {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct TextMatch {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
    pub column: usize,
}

#[derive(Debug, Deserialize)]
pub struct SearchFileOptions {
    pub max_results: Option<usize>,
    pub include_hidden: Option<bool>,
    pub file_extensions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct SearchTextOptions {
    pub max_results: Option<usize>,
    pub case_sensitive: Option<bool>,
    pub include_hidden: Option<bool>,
    pub file_extensions: Option<Vec<String>>,
    pub max_file_size: Option<u64>,
}

const DEFAULT_MAX_RESULTS: usize = 500;
const DEFAULT_MAX_FILE_SIZE: u64 = 2 * 1024 * 1024; // 2MB

fn should_skip_entry(entry: &walkdir::DirEntry, include_hidden: bool) -> bool {
    let name = entry.file_name().to_string_lossy();
    if !include_hidden && name.starts_with('.') {
        return true;
    }
    let skip_dirs = [
        "node_modules",
        "target",
        ".git",
        "dist",
        "build",
        "__pycache__",
        ".next",
    ];
    if entry.file_type().is_dir() && skip_dirs.contains(&name.as_ref()) {
        return true;
    }
    false
}

#[tauri::command]
pub fn search_files(
    root: String,
    pattern: String,
    options: Option<SearchFileOptions>,
) -> Result<Vec<FileMatch>, String> {
    let max_results = options
        .as_ref()
        .and_then(|o| o.max_results)
        .unwrap_or(DEFAULT_MAX_RESULTS);
    let include_hidden = options
        .as_ref()
        .and_then(|o| o.include_hidden)
        .unwrap_or(false);
    let extensions: Option<Vec<String>> = options.as_ref().and_then(|o| {
        o.file_extensions
            .as_ref()
            .map(|exts| exts.iter().map(|e| e.to_lowercase()).collect())
    });

    let pattern_lower = pattern.to_lowercase();
    let mut results = Vec::new();

    let walker = WalkDir::new(&root).follow_links(false).max_depth(20);

    for entry in walker.into_iter().filter_entry(|e| !should_skip_entry(e, include_hidden)) {
        if results.len() >= max_results {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().contains(&pattern_lower) {
            continue;
        }

        if let Some(ref exts) = extensions {
            if entry.file_type().is_file() {
                let has_ext = entry
                    .path()
                    .extension()
                    .map(|e| exts.contains(&e.to_string_lossy().to_lowercase()))
                    .unwrap_or(false);
                if !has_ext {
                    continue;
                }
            }
        }

        results.push(FileMatch {
            path: entry.path().to_string_lossy().to_string(),
            name,
            is_dir: entry.file_type().is_dir(),
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn search_text(
    root: String,
    query: String,
    options: Option<SearchTextOptions>,
) -> Result<Vec<TextMatch>, String> {
    let max_results = options
        .as_ref()
        .and_then(|o| o.max_results)
        .unwrap_or(DEFAULT_MAX_RESULTS);
    let case_sensitive = options
        .as_ref()
        .and_then(|o| o.case_sensitive)
        .unwrap_or(false);
    let include_hidden = options
        .as_ref()
        .and_then(|o| o.include_hidden)
        .unwrap_or(false);
    let max_file_size = options
        .as_ref()
        .and_then(|o| o.max_file_size)
        .unwrap_or(DEFAULT_MAX_FILE_SIZE);
    let extensions: Option<Vec<String>> = options.as_ref().and_then(|o| {
        o.file_extensions
            .as_ref()
            .map(|exts| exts.iter().map(|e| e.to_lowercase()).collect())
    });

    let query_cmp = if case_sensitive {
        query.clone()
    } else {
        query.to_lowercase()
    };

    let mut results = Vec::new();
    let walker = WalkDir::new(&root).follow_links(false).max_depth(20);

    for entry in walker.into_iter().filter_entry(|e| !should_skip_entry(e, include_hidden)) {
        if results.len() >= max_results {
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if !entry.file_type().is_file() {
            continue;
        }

        if let Some(ref exts) = extensions {
            let has_ext = entry
                .path()
                .extension()
                .map(|e| exts.contains(&e.to_string_lossy().to_lowercase()))
                .unwrap_or(false);
            if !has_ext {
                continue;
            }
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if metadata.len() > max_file_size {
            continue;
        }

        let content = match fs::read_to_string(entry.path()) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (line_idx, line) in content.lines().enumerate() {
            if results.len() >= max_results {
                break;
            }
            let line_cmp = if case_sensitive {
                line.to_string()
            } else {
                line.to_lowercase()
            };
            if let Some(col) = line_cmp.find(&query_cmp) {
                results.push(TextMatch {
                    path: entry.path().to_string_lossy().to_string(),
                    line_number: line_idx + 1,
                    line_content: line.to_string(),
                    column: col,
                });
            }
        }
    }

    Ok(results)
}
