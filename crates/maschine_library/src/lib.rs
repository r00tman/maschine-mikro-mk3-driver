pub mod controls;
pub mod font;
pub mod lights;
pub mod screen;

use hidapi::{HidError, HidResult};

// A partial HID report must not be retried as a new report with the remaining bytes.
fn write_report(report: &[u8], write: impl FnOnce(&[u8]) -> HidResult<usize>) -> HidResult<()> {
    let written = write(report)?;
    check_report_length(report.len(), written)
}

fn check_report_length(expected: usize, written: usize) -> HidResult<()> {
    // The Windows HIDAPI backend may pad a short report to the device's longest
    // output report and return that larger size. Only a smaller count is short.
    if written < expected {
        return Err(HidError::HidApiError {
            message: format!("Incomplete HID report: wrote {written} of {expected} bytes"),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::check_report_length;
    #[test]
    fn accepts_complete_and_padded_reports() {
        assert!(check_report_length(81, 81).is_ok());
        assert!(check_report_length(81, 265).is_ok());
        assert!(check_report_length(265, 264).is_err());
        assert!(check_report_length(81, 0).is_err());
    }
}
