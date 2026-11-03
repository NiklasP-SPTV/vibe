use super::GpuDevice;
use eyre::{bail, Context, Result};
use std::path::Path;
use std::process::{Command, Stdio};

pub fn list_gpu_devices(binary_path: &Path) -> Result<Vec<GpuDevice>> {
    let mut cmd = Command::new(binary_path);
    cmd.args(["devices"]).stdout(Stdio::piped()).stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let output = cmd.output().context("failed to run server devices")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("vibe-server devices failed: {}", stderr.trim());
    }

    serde_json::from_slice(&output.stdout).context("failed to parse server devices output")
}

/// The device to load on when the user picked none. The engine counts GPUs in the order the
/// driver lists them and takes the first, which on a machine with a CPU-integrated GPU is
/// usually that one — a Radeon iGPU ahead of an RTX card runs Whisper several times slower.
/// The first discrete GPU wins; `None` keeps the engine's own choice, when that already is one
/// or there is no discrete GPU at all.
pub fn preferred_gpu_device(devices: &[GpuDevice]) -> Option<i32> {
    let first_discrete = devices.iter().position(|device| device.device_type == "gpu")?;
    (first_discrete > 0).then_some(first_discrete as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(device_type: &str) -> GpuDevice {
        GpuDevice {
            index: 0,
            name: String::new(),
            description: String::new(),
            device_type: device_type.into(),
        }
    }

    #[test]
    fn prefers_a_discrete_gpu_listed_after_an_integrated_one() {
        assert_eq!(preferred_gpu_device(&[device("igpu"), device("gpu")]), Some(1));
    }

    #[test]
    fn keeps_the_engine_choice_otherwise() {
        assert_eq!(preferred_gpu_device(&[device("gpu"), device("igpu")]), None);
        assert_eq!(preferred_gpu_device(&[device("igpu")]), None);
        assert_eq!(preferred_gpu_device(&[]), None);
    }
}
