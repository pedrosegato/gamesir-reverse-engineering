use crate::indicator::Rgb;

pub const ICON_SIZE: u32 = 32;
const OUTLINE: Rgb = [40, 40, 40];
const OUTLINE_WIDTH: f32 = 2.0;

pub fn circle_rgba(color: Rgb) -> Vec<u8> {
    let center = ICON_SIZE as f32 / 2.0;
    let radius = center - 1.0;
    let mut rgba = Vec::with_capacity((ICON_SIZE * ICON_SIZE * 4) as usize);
    for y in 0..ICON_SIZE {
        for x in 0..ICON_SIZE {
            let distance = (x as f32 + 0.5 - center).hypot(y as f32 + 0.5 - center);
            let alpha = (radius - distance + 0.5).clamp(0.0, 1.0);
            let [r, g, b] = if distance < radius - OUTLINE_WIDTH { color } else { OUTLINE };
            rgba.extend_from_slice(&[r, g, b, (alpha * 255.0).round() as u8]);
        }
    }
    rgba
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_has_the_color_and_corners_are_transparent() {
        let rgba = circle_rgba([1, 2, 3]);
        let pixel = |x: u32, y: u32| {
            let i = ((y * ICON_SIZE + x) * 4) as usize;
            [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]
        };
        assert_eq!(rgba.len(), (ICON_SIZE * ICON_SIZE * 4) as usize);
        assert_eq!(pixel(16, 16), [1, 2, 3, 255]);
        assert_eq!(pixel(0, 0)[3], 0);
    }
}
