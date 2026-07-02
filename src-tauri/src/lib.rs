use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

fn workspace_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let workspace_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("MyNoteWorkspace");

    fs::create_dir_all(&workspace_dir).map_err(|error| error.to_string())?;
    Ok(workspace_dir.join("workspace.json"))
}

#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let path = workspace_file(&app)?;

    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let workspace = serde_json::from_str(&content).map_err(|error| error.to_string())?;
    Ok(Some(workspace))
}

#[tauri::command]
fn save_workspace(app: tauri::AppHandle, workspace: Value) -> Result<(), String> {
    let path = workspace_file(&app)?;
    let content = serde_json::to_string_pretty(&workspace).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_workspace, save_workspace])
        .run(tauri::generate_context!())
        .expect("failed to run MyNote desktop app");
}
