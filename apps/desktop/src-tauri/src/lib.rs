use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env, fs,
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl,
    WebviewWindowBuilder, WindowEvent, Wry,
};

const MAIN_WINDOW_LABEL: &str = "main";

struct PauseMenuItem(MenuItem<Wry>);

struct ActivityCaptureState {
    paused: Arc<AtomicBool>,
}

#[derive(Clone, Serialize)]
struct ActiveWindowPayload {
    timestamp_ms: u64,
    app_name: Option<String>,
    window_title: Option<String>,
    capture_error: Option<String>,
}

#[derive(Deserialize)]
struct NarrativeGenerationRequest {
    prompt: String,
    model: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct GeneratedWeeklyNarrative {
    week_id: String,
    headline: String,
    summary_text: String,
    key_drivers: Vec<String>,
    manager_ready_summary: String,
}

#[derive(Serialize)]
struct NarrativeGenerationResponse {
    narrative: GeneratedWeeklyNarrative,
    model: String,
}

#[derive(Deserialize)]
struct WorkBlockClassificationRequest {
    prompt: String,
    model: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct ClassifiedWorkBlock {
    session_ids: Vec<String>,
    start_time: String,
    end_time: String,
    category: String,
    mode: String,
    planned_status: String,
    project_name: String,
    stakeholder_group: String,
    evidence: Vec<String>,
    confidence: f64,
    blocker_flag: bool,
    notes: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct WorkBlockClassificationResult {
    work_blocks: Vec<ClassifiedWorkBlock>,
}

#[derive(Serialize)]
struct WorkBlockClassificationResponse {
    result: WorkBlockClassificationResult,
    model: String,
}

#[derive(Deserialize)]
struct ReviewCopilotRequest {
    prompt: String,
    model: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct ReviewCopilotSuggestionOutput {
    action: String,
    work_block_ids: Vec<String>,
    title: String,
    rationale: String,
    confidence: f64,
    proposed_category: Option<String>,
    proposed_mode: Option<String>,
    proposed_planned_status: Option<String>,
    proposed_project_name: Option<String>,
    proposed_stakeholder_group: Option<String>,
    proposed_blocker_flag: Option<bool>,
    proposed_notes: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct ReviewCopilotResult {
    suggestions: Vec<ReviewCopilotSuggestionOutput>,
}

#[derive(Serialize)]
struct ReviewCopilotResponse {
    result: ReviewCopilotResult,
    model: String,
}

#[derive(Deserialize)]
struct ForecastAgentRequest {
    prompt: String,
    model: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct ForecastAgentResult {
    forecast_week_label: String,
    reliable_new_work_capacity_pct: f64,
    confidence: f64,
    headline: String,
    summary_text: String,
    key_constraints: Vec<String>,
    risk_flags: Vec<String>,
    recommended_actions: Vec<String>,
    assumptions: Vec<String>,
    optimistic_capacity_pct: f64,
    likely_capacity_pct: f64,
    conservative_capacity_pct: f64,
}

#[derive(Serialize)]
struct ForecastAgentResponse {
    forecast: ForecastAgentResult,
    model: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VisualContextRequest {
    prompt: String,
    app_name: String,
    window_title: Option<String>,
    session_id: Option<String>,
    model: Option<String>,
}

#[derive(Deserialize, Serialize)]
struct VisualContextInsightOutput {
    activity_summary: String,
    visible_tool: Option<String>,
    likely_work_category: Option<String>,
    likely_mode: Option<String>,
    project_hint: Option<String>,
    sensitive_content_detected: bool,
    confidence: f64,
    evidence: Vec<String>,
}

#[derive(Serialize)]
struct VisualContextResponse {
    insight: VisualContextInsightOutput,
    model: String,
    captured_at_ms: u64,
    app_name: String,
    window_title: Option<String>,
    session_id: Option<String>,
    raw_screenshot_retained: bool,
}

fn show_dashboard(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::default())
        .title("ClearCapacity")
        .inner_size(1280.0, 860.0)
        .min_inner_size(1024.0, 720.0)
        .visible(true)
        .build();
}

#[tauri::command]
fn set_clear_capacity_window_mode(app: AppHandle, mode: String) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        match mode.as_str() {
            "compact" => {
                let _ = window.set_min_size(Some(PhysicalSize::new(760, 320)));
                let _ = window.set_size(PhysicalSize::new(860, 380));
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let monitor_position = monitor.position();
                    let monitor_size = monitor.size();
                    let x = monitor_position.x + monitor_size.width as i32 - 888;
                    let y = monitor_position.y + 72;
                    let _ = window.set_position(PhysicalPosition::new(x, y));
                }
            }
            _ => {
                let _ = window.set_min_size(Some(PhysicalSize::new(1024, 720)));
                let _ = window.set_size(PhysicalSize::new(1280, 860));
                let _ = window.center();
            }
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn sample_active_window() -> ActiveWindowPayload {
    let output = Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\"",
            "-e",
            "set frontApp to name of first application process whose frontmost is true",
            "-e",
            "set windowTitle to \"\"",
            "-e",
            "try",
            "-e",
            "set windowTitle to name of front window of process frontApp",
            "-e",
            "end try",
            "-e",
            "return frontApp & linefeed & windowTitle",
            "-e",
            "end tell",
        ])
        .output();

    match output {
        Ok(result) if result.status.success() => {
            let stdout = String::from_utf8_lossy(&result.stdout);
            let mut lines = stdout.lines();
            let app_name = lines
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let window_title = lines
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);

            ActiveWindowPayload {
                timestamp_ms: now_ms(),
                app_name,
                window_title,
                capture_error: None,
            }
        }
        Ok(result) => ActiveWindowPayload {
            timestamp_ms: now_ms(),
            app_name: None,
            window_title: None,
            capture_error: Some(String::from_utf8_lossy(&result.stderr).trim().to_string()),
        },
        Err(error) => ActiveWindowPayload {
            timestamp_ms: now_ms(),
            app_name: None,
            window_title: None,
            capture_error: Some(error.to_string()),
        },
    }
}

fn extract_response_text(value: &Value) -> Option<String> {
    if let Some(output_text) = value.get("output_text").and_then(Value::as_str) {
        return Some(output_text.to_string());
    }

    value
        .get("output")?
        .as_array()?
        .iter()
        .flat_map(|item| {
            item.get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .find_map(|content| {
            content
                .get("text")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
}

fn capture_screen_png_base64() -> Result<String, String> {
    let path = env::temp_dir().join(format!("clear-capacity-visual-context-{}.png", now_ms()));
    let status = Command::new("screencapture")
        .args(["-x", "-t", "png"])
        .arg(&path)
        .status()
        .map_err(|error| format!("Could not start macOS screen capture: {error}"))?;

    if !status.success() {
        let _ = fs::remove_file(&path);
        return Err(
            "macOS screen capture failed. ClearCapacity may need Screen Recording permission."
                .to_string(),
        );
    }

    let bytes =
        fs::read(&path).map_err(|error| format!("Could not read screen capture: {error}"))?;
    let _ = fs::remove_file(&path);
    Ok(general_purpose::STANDARD.encode(bytes))
}

fn start_activity_capture(app: AppHandle, paused: Arc<AtomicBool>) {
    thread::spawn(move || loop {
        if !paused.load(Ordering::SeqCst) {
            let payload = sample_active_window();
            let _ = app.emit("clear-capacity:active-window-sample", payload);
        }

        thread::sleep(Duration::from_secs(5));
    });
}

fn dispatch_to_main_window(app: &AppHandle, script: &str) {
    show_dashboard(app);

    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.eval(script);
    }
}

fn navigate(app: &AppHandle, screen: &str) {
    dispatch_to_main_window(
        app,
        &format!(
            "window.dispatchEvent(new CustomEvent('clear-capacity:navigate', {{ detail: '{}' }}))",
            screen
        ),
    );
}

#[tauri::command]
fn set_pause_menu_label(pause_item: State<'_, PauseMenuItem>, paused: bool) {
    let label = if paused {
        "Resume Tracking"
    } else {
        "Pause Tracking"
    };
    let _ = pause_item.0.set_text(label);
}

#[tauri::command]
fn set_activity_capture_paused(activity_state: State<'_, ActivityCaptureState>, paused: bool) {
    activity_state.paused.store(paused, Ordering::SeqCst);
}

#[tauri::command]
async fn generate_weekly_narrative_with_openai(
    request: NarrativeGenerationRequest,
) -> Result<NarrativeGenerationResponse, String> {
    let api_key = env::var("OPENAI_API_KEY").map_err(|_| {
        "OPENAI_API_KEY is not configured for this ClearCapacity process.".to_string()
    })?;
    let model = request
        .model
        .or_else(|| env::var("OPENAI_MODEL").ok())
        .unwrap_or_else(|| "gpt-5.5".to_string());
    let schema = json!({
      "type": "object",
      "additionalProperties": false,
      "required": ["week_id", "headline", "summary_text", "key_drivers", "manager_ready_summary"],
      "properties": {
        "week_id": { "type": "string" },
        "headline": { "type": "string" },
        "summary_text": { "type": "string" },
        "key_drivers": {
          "type": "array",
          "minItems": 3,
          "maxItems": 6,
          "items": { "type": "string" }
        },
        "manager_ready_summary": { "type": "string" }
      }
    });
    let body = json!({
      "model": model,
      "store": false,
      "reasoning": {
        "effort": "low"
      },
      "instructions": "You generate ClearCapacity weekly workload narratives from structured local analyst-work context. Be concrete, concise, explainable, and careful not to overstate certainty. Return only JSON matching the requested schema.",
      "input": request.prompt,
      "text": {
        "format": {
          "type": "json_schema",
          "name": "clear_capacity_weekly_narrative",
          "strict": true,
          "schema": schema
        }
      }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("OpenAI request failed: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("OpenAI response could not be read: {error}"))?;

    if !status.is_success() {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("OpenAI returned an error.");
        return Err(format!("{message} ({status})"));
    }

    let output_text = extract_response_text(&value)
        .ok_or_else(|| "OpenAI response did not include generated text.".to_string())?;
    let narrative = serde_json::from_str::<GeneratedWeeklyNarrative>(&output_text)
        .map_err(|error| format!("OpenAI narrative JSON could not be parsed: {error}"))?;

    Ok(NarrativeGenerationResponse { narrative, model })
}

#[tauri::command]
async fn classify_active_window_sessions_with_openai(
    request: WorkBlockClassificationRequest,
) -> Result<WorkBlockClassificationResponse, String> {
    let api_key = env::var("OPENAI_API_KEY").map_err(|_| {
        "OPENAI_API_KEY is not configured for this ClearCapacity process.".to_string()
    })?;
    let model = request
        .model
        .or_else(|| env::var("OPENAI_MODEL").ok())
        .unwrap_or_else(|| "gpt-5.5".to_string());
    let schema = json!({
      "type": "object",
      "additionalProperties": false,
      "required": ["work_blocks"],
      "properties": {
        "work_blocks": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "session_ids",
              "start_time",
              "end_time",
              "category",
              "mode",
              "planned_status",
              "project_name",
              "stakeholder_group",
              "evidence",
              "confidence",
              "blocker_flag",
              "notes"
            ],
            "properties": {
              "session_ids": {
                "type": "array",
                "minItems": 1,
                "items": { "type": "string" }
              },
              "start_time": { "type": "string" },
              "end_time": { "type": "string" },
              "category": {
                "type": "string",
                "enum": [
                  "Planned analysis / project work",
                  "Ad hoc stakeholder requests",
                  "Recurring reporting",
                  "Dashboard development / edits",
                  "SQL / data modeling / query work",
                  "QA / data validation",
                  "Debugging / issue investigation",
                  "Documentation / requirement clarification",
                  "Meetings / stakeholder syncs",
                  "Admin / coordination",
                  "Blocked / waiting / dependency delay"
                ]
              },
              "mode": {
                "type": "string",
                "enum": ["Deep work", "Reactive", "Collaborative", "Fragmented", "Blocked"]
              },
              "planned_status": {
                "type": "string",
                "enum": ["planned", "unplanned", "fixed", "blocked"]
              },
              "project_name": { "type": "string" },
              "stakeholder_group": { "type": "string" },
              "evidence": {
                "type": "array",
                "minItems": 2,
                "maxItems": 5,
                "items": { "type": "string" }
              },
              "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "blocker_flag": { "type": "boolean" },
              "notes": {
                "type": ["string", "null"]
              }
            }
          }
        }
      }
    });
    let body = json!({
      "model": model,
      "store": false,
      "reasoning": {
        "effort": "low"
      },
      "instructions": "You classify local macOS active-window sessions into ClearCapacity draft work blocks. Be conservative, evidence-based, and return only JSON matching the requested schema.",
      "input": request.prompt,
      "text": {
        "format": {
          "type": "json_schema",
          "name": "clear_capacity_work_block_classification",
          "strict": true,
          "schema": schema
        }
      }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("OpenAI request failed: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("OpenAI response could not be read: {error}"))?;

    if !status.is_success() {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("OpenAI returned an error.");
        return Err(format!("{message} ({status})"));
    }

    let output_text = extract_response_text(&value)
        .ok_or_else(|| "OpenAI response did not include generated text.".to_string())?;
    let result = serde_json::from_str::<WorkBlockClassificationResult>(&output_text)
        .map_err(|error| format!("OpenAI classification JSON could not be parsed: {error}"))?;

    Ok(WorkBlockClassificationResponse { result, model })
}

#[tauri::command]
async fn generate_review_copilot_suggestions_with_openai(
    request: ReviewCopilotRequest,
) -> Result<ReviewCopilotResponse, String> {
    let api_key = env::var("OPENAI_API_KEY").map_err(|_| {
        "OPENAI_API_KEY is not configured for this ClearCapacity process.".to_string()
    })?;
    let model = request
        .model
        .or_else(|| env::var("OPENAI_MODEL").ok())
        .unwrap_or_else(|| "gpt-5.5".to_string());
    let nullable_taxonomy = |values: Vec<&str>| {
        json!({
          "anyOf": [
            { "type": "string", "enum": values },
            { "type": "null" }
          ]
        })
    };
    let schema = json!({
      "type": "object",
      "additionalProperties": false,
      "required": ["suggestions"],
      "properties": {
        "suggestions": {
          "type": "array",
          "maxItems": 8,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "action",
              "work_block_ids",
              "title",
              "rationale",
              "confidence",
              "proposed_category",
              "proposed_mode",
              "proposed_planned_status",
              "proposed_project_name",
              "proposed_stakeholder_group",
              "proposed_blocker_flag",
              "proposed_notes"
            ],
            "properties": {
              "action": {
                "type": "string",
                "enum": ["confirm", "relabel", "exclude", "merge", "split", "note"]
              },
              "work_block_ids": {
                "type": "array",
                "minItems": 1,
                "items": { "type": "string" }
              },
              "title": { "type": "string" },
              "rationale": { "type": "string" },
              "confidence": {
                "type": "number",
                "minimum": 0,
                "maximum": 1
              },
              "proposed_category": nullable_taxonomy(vec![
                "Planned analysis / project work",
                "Ad hoc stakeholder requests",
                "Recurring reporting",
                "Dashboard development / edits",
                "SQL / data modeling / query work",
                "QA / data validation",
                "Debugging / issue investigation",
                "Documentation / requirement clarification",
                "Meetings / stakeholder syncs",
                "Admin / coordination",
                "Blocked / waiting / dependency delay"
              ]),
              "proposed_mode": nullable_taxonomy(vec![
                "Deep work",
                "Reactive",
                "Collaborative",
                "Fragmented",
                "Blocked"
              ]),
              "proposed_planned_status": nullable_taxonomy(vec![
                "planned",
                "unplanned",
                "fixed",
                "blocked"
              ]),
              "proposed_project_name": {
                "type": ["string", "null"]
              },
              "proposed_stakeholder_group": {
                "type": ["string", "null"]
              },
              "proposed_blocker_flag": {
                "type": ["boolean", "null"]
              },
              "proposed_notes": {
                "type": ["string", "null"]
              }
            }
          }
        }
      }
    });
    let body = json!({
      "model": model,
      "store": false,
      "reasoning": {
        "effort": "low"
      },
      "instructions": "You generate ClearCapacity Daily Review Copilot suggestions. Be conservative, actionable, and return only JSON matching the requested schema.",
      "input": request.prompt,
      "text": {
        "format": {
          "type": "json_schema",
          "name": "clear_capacity_review_copilot_suggestions",
          "strict": true,
          "schema": schema
        }
      }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("OpenAI request failed: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("OpenAI response could not be read: {error}"))?;

    if !status.is_success() {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("OpenAI returned an error.");
        return Err(format!("{message} ({status})"));
    }

    let output_text = extract_response_text(&value)
        .ok_or_else(|| "OpenAI response did not include generated text.".to_string())?;
    let result = serde_json::from_str::<ReviewCopilotResult>(&output_text)
        .map_err(|error| format!("OpenAI review suggestions JSON could not be parsed: {error}"))?;

    Ok(ReviewCopilotResponse { result, model })
}

#[tauri::command]
async fn generate_forecast_agent_with_openai(
    request: ForecastAgentRequest,
) -> Result<ForecastAgentResponse, String> {
    let api_key = env::var("OPENAI_API_KEY").map_err(|_| {
        "OPENAI_API_KEY is not configured for this ClearCapacity process.".to_string()
    })?;
    let model = request
        .model
        .or_else(|| env::var("OPENAI_MODEL").ok())
        .unwrap_or_else(|| "gpt-5.5".to_string());
    let string_array = || {
        json!({
          "type": "array",
          "minItems": 2,
          "maxItems": 6,
          "items": { "type": "string" }
        })
    };
    let pct_number = || {
        json!({
          "type": "number",
          "minimum": 0,
          "maximum": 40
        })
    };
    let schema = json!({
      "type": "object",
      "additionalProperties": false,
      "required": [
        "forecast_week_label",
        "reliable_new_work_capacity_pct",
        "confidence",
        "headline",
        "summary_text",
        "key_constraints",
        "risk_flags",
        "recommended_actions",
        "assumptions",
        "optimistic_capacity_pct",
        "likely_capacity_pct",
        "conservative_capacity_pct"
      ],
      "properties": {
        "forecast_week_label": { "type": "string" },
        "reliable_new_work_capacity_pct": pct_number(),
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "headline": { "type": "string" },
        "summary_text": { "type": "string" },
        "key_constraints": string_array(),
        "risk_flags": string_array(),
        "recommended_actions": string_array(),
        "assumptions": string_array(),
        "optimistic_capacity_pct": pct_number(),
        "likely_capacity_pct": pct_number(),
        "conservative_capacity_pct": pct_number()
      }
    });
    let body = json!({
      "model": model,
      "store": false,
      "reasoning": {
        "effort": "low"
      },
      "instructions": "You generate ClearCapacity next-week capacity forecasts. Be conservative, explainable, planning-oriented, and return only JSON matching the requested schema.",
      "input": request.prompt,
      "text": {
        "format": {
          "type": "json_schema",
          "name": "clear_capacity_forecast_agent",
          "strict": true,
          "schema": schema
        }
      }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("OpenAI request failed: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("OpenAI response could not be read: {error}"))?;

    if !status.is_success() {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("OpenAI returned an error.");
        return Err(format!("{message} ({status})"));
    }

    let output_text = extract_response_text(&value)
        .ok_or_else(|| "OpenAI response did not include generated text.".to_string())?;
    let forecast = serde_json::from_str::<ForecastAgentResult>(&output_text)
        .map_err(|error| format!("OpenAI forecast JSON could not be parsed: {error}"))?;

    Ok(ForecastAgentResponse { forecast, model })
}

#[tauri::command]
async fn capture_visual_context_with_openai(
    request: VisualContextRequest,
) -> Result<VisualContextResponse, String> {
    let api_key = env::var("OPENAI_API_KEY").map_err(|_| {
        "OPENAI_API_KEY is not configured for this ClearCapacity process.".to_string()
    })?;
    let model = request
        .model
        .or_else(|| env::var("OPENAI_VISION_MODEL").ok())
        .or_else(|| env::var("OPENAI_MODEL").ok())
        .unwrap_or_else(|| "gpt-5.5".to_string());
    let captured_at_ms = now_ms();
    let image_base64 = capture_screen_png_base64()?;
    let data_url = format!("data:image/png;base64,{image_base64}");
    let nullable_taxonomy = |values: Vec<&str>| {
        json!({
          "anyOf": [
            { "type": "string", "enum": values },
            { "type": "null" }
          ]
        })
    };
    let schema = json!({
      "type": "object",
      "additionalProperties": false,
      "required": [
        "activity_summary",
        "visible_tool",
        "likely_work_category",
        "likely_mode",
        "project_hint",
        "sensitive_content_detected",
        "confidence",
        "evidence"
      ],
      "properties": {
        "activity_summary": { "type": "string" },
        "visible_tool": { "type": ["string", "null"] },
        "likely_work_category": nullable_taxonomy(vec![
          "Planned analysis / project work",
          "Ad hoc stakeholder requests",
          "Recurring reporting",
          "Dashboard development / edits",
          "SQL / data modeling / query work",
          "QA / data validation",
          "Debugging / issue investigation",
          "Documentation / requirement clarification",
          "Meetings / stakeholder syncs",
          "Admin / coordination",
          "Blocked / waiting / dependency delay"
        ]),
        "likely_mode": nullable_taxonomy(vec![
          "Deep work",
          "Reactive",
          "Collaborative",
          "Fragmented",
          "Blocked"
        ]),
        "project_hint": { "type": ["string", "null"] },
        "sensitive_content_detected": { "type": "boolean" },
        "confidence": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        },
        "evidence": {
          "type": "array",
          "minItems": 2,
          "maxItems": 5,
          "items": { "type": "string" }
        }
      }
    });
    let body = json!({
      "model": model,
      "store": false,
      "reasoning": {
        "effort": "low"
      },
      "instructions": "You generate privacy-conscious ClearCapacity Visual Context insights from consented screenshots. Avoid transcribing sensitive details and return only JSON matching the requested schema.",
      "input": [{
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": request.prompt
          },
          {
            "type": "input_image",
            "image_url": data_url,
            "detail": "low"
          }
        ]
      }],
      "text": {
        "format": {
          "type": "json_schema",
          "name": "clear_capacity_visual_context",
          "strict": true,
          "schema": schema
        }
      }
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("OpenAI request failed: {error}"))?;
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|error| format!("OpenAI response could not be read: {error}"))?;

    if !status.is_success() {
        let message = value
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("OpenAI returned an error.");
        return Err(format!("{message} ({status})"));
    }

    let output_text = extract_response_text(&value)
        .ok_or_else(|| "OpenAI response did not include generated text.".to_string())?;
    let insight = serde_json::from_str::<VisualContextInsightOutput>(&output_text)
        .map_err(|error| format!("OpenAI visual context JSON could not be parsed: {error}"))?;

    Ok(VisualContextResponse {
        insight,
        model,
        captured_at_ms,
        app_name: request.app_name,
        window_title: request.window_title,
        session_id: request.session_id,
        raw_screenshot_retained: false,
    })
}

fn configure_tray(app: &tauri::App) -> tauri::Result<()> {
    let open_dashboard =
        MenuItem::with_id(app, "open-dashboard", "Open Dashboard", true, None::<&str>)?;
    let live_ledger =
        MenuItem::with_id(app, "live-ledger", "Live Work Ledger", true, None::<&str>)?;
    let daily_review = MenuItem::with_id(app, "daily-review", "Daily Review", true, None::<&str>)?;
    let weekly_capacity = MenuItem::with_id(
        app,
        "weekly-capacity",
        "Weekly Capacity",
        true,
        None::<&str>,
    )?;
    let manager_summary = MenuItem::with_id(
        app,
        "manager-summary",
        "Manager Summary",
        true,
        None::<&str>,
    )?;
    let audit_log = MenuItem::with_id(app, "audit-log", "Audit Log", true, None::<&str>)?;
    let copy_manager_summary = MenuItem::with_id(
        app,
        "copy-manager-summary",
        "Copy Manager Summary",
        true,
        None::<&str>,
    )?;
    let pause_tracking =
        MenuItem::with_id(app, "pause-tracking", "Pause Tracking", true, None::<&str>)?;
    let preferences = MenuItem::with_id(app, "preferences", "Preferences", true, None::<&str>)?;
    let reset_review = MenuItem::with_id(
        app,
        "reset-review",
        "Reset Prototype Data",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit ClearCapacity", true, None::<&str>)?;
    let separator_one = PredefinedMenuItem::separator(app)?;
    let separator_two = PredefinedMenuItem::separator(app)?;
    let separator_three = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_dashboard,
            &live_ledger,
            &daily_review,
            &weekly_capacity,
            &manager_summary,
            &audit_log,
            &separator_one,
            &copy_manager_summary,
            &pause_tracking,
            &separator_two,
            &preferences,
            &reset_review,
            &separator_three,
            &quit,
        ],
    )?;
    let icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;
    let pause_tracking_for_menu = pause_tracking.clone();
    app.manage(PauseMenuItem(pause_tracking.clone()));

    TrayIconBuilder::new()
        .tooltip("ClearCapacity")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open-dashboard" => show_dashboard(app),
            "live-ledger" => navigate(app, "ledger"),
            "daily-review" => navigate(app, "daily"),
            "weekly-capacity" => navigate(app, "weekly"),
            "manager-summary" => navigate(app, "narrative"),
            "audit-log" => navigate(app, "audit"),
            "copy-manager-summary" => {
                dispatch_to_main_window(
                    app,
                    "window.dispatchEvent(new CustomEvent('clear-capacity:copy-manager-summary'))",
                );
            }
            "pause-tracking" => {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    let _ = window.eval(
                        "window.dispatchEvent(new CustomEvent('clear-capacity:toggle-pause'))",
                    );
                }
                let current_text = pause_tracking_for_menu
                    .text()
                    .unwrap_or_else(|_| "Pause Tracking".to_string());
                let next_text = if current_text == "Pause Tracking" {
                    "Resume Tracking"
                } else {
                    "Pause Tracking"
                };
                let _ = pause_tracking_for_menu.set_text(next_text);
            }
            "preferences" => navigate(app, "setup"),
            "reset-review" => {
                dispatch_to_main_window(
                    app,
                    "window.dispatchEvent(new CustomEvent('clear-capacity:reset-local-data'))",
                );
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let activity_capture_paused = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .manage(ActivityCaptureState {
            paused: activity_capture_paused.clone(),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            set_pause_menu_label,
            set_activity_capture_paused,
            generate_weekly_narrative_with_openai,
            classify_active_window_sessions_with_openai,
            generate_review_copilot_suggestions_with_openai,
            generate_forecast_agent_with_openai,
            capture_visual_context_with_openai,
            set_clear_capacity_window_mode
        ])
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            configure_tray(app)?;
            start_activity_capture(app.handle().clone(), activity_capture_paused.clone());

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running ClearCapacity");
}
