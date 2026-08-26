import { test, expect } from '@playwright/test';
import path from 'path';

const SAMPLE_DIR = path.resolve(__dirname, '../sample_data/ScreenRecording/screen_20260730_210237_001');
const CSV_PATH = path.resolve(__dirname, '../sample_data/TelemetryLog/telemetry_20260730_210205.csv');
const AUDIO_PATH = path.join(SAMPLE_DIR, 'audio.wav');

// First 10 frame images for speed
const FRAME_PATHS = Array.from({ length: 10 }, (_, i) =>
  path.join(SAMPLE_DIR, `frame_${i.toString().padStart(4, '0')}.jpg`)
);

test.describe('Annotation Session Labeler E2E', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#upload-grid');
  });

  test('upload page renders 4 blocks', async ({ page }) => {
    await expect(page.locator('#block-gameplay')).toBeVisible();
    await expect(page.locator('#block-gaming-space')).toBeVisible();
    await expect(page.locator('#block-telemetry')).toBeVisible();
    await expect(page.locator('#block-audio')).toBeVisible();
    await expect(page.locator('#btn-start-session')).toBeDisabled();
  });

  test('full upload → session → rating → export flow', async ({ page }) => {
    // === Step 1: Upload images via hidden input ===
    // Open modal first so the input is rendered
    await page.click('#block-gameplay');
    await page.waitForSelector('h3:text("Upload Gameplay Media")');

    // Set files directly on the hidden input (now rendered inside modal)
    const imageInput = page.locator('#input-gameplay');
    await imageInput.setInputFiles(FRAME_PATHS);

    // Modal should auto-close, block should show image count
    await expect(page.locator('#block-gameplay')).toContainText('images');

    // === Step 2: Upload CSV ===
    const csvInput = page.locator('#input-telemetry');
    await csvInput.setInputFiles(CSV_PATH);
    await expect(page.locator('#block-telemetry')).toContainText('events');

    // === Step 3: Upload Audio ===
    const audioInput = page.locator('#input-audio');
    await audioInput.setInputFiles(AUDIO_PATH);
    await expect(page.locator('#block-audio')).toContainText('audio.wav');

    // === Step 4: Start Session ===
    const startBtn = page.locator('#btn-start-session');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    // Should transition to session view
    await page.waitForTimeout(500);

    // Check session view elements
    await expect(page.locator('text=Frame 1')).toBeVisible();
    await expect(page.locator('text=Telemetry Log')).toBeVisible();

    // === Step 5: Navigate and Rate ===
    // Go to next event
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);

    // Rate up twice → +0.2
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    await expect(page.locator('text=+0.2')).toBeVisible();

    // Go to next — should carry forward +0.2
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(page.locator('text=+0.2')).toBeVisible();

    // Rate down → +0.1
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await expect(page.locator('text=+0.1')).toBeVisible();

    console.log('✅ E2E: upload → session → navigate → rate → carry-forward ALL PASSED');
  });

  test('guided label file upload, validation, and timeline guide display', async ({ page }) => {
    const GUIDED_LABEL_PATH = path.resolve(__dirname, '../sample_data/SampleTrue/label_20260814_082555_A02.csv');

    // 1. Verify Guided Label Block renders
    await expect(page.locator('#block-guided-label')).toBeVisible();
    await expect(page.locator('#btn-upload-guided-file')).toBeVisible();

    // 2. Set dimensions to Valence & Arousal via quick preset
    await page.click('#btn-preset-va');

    // 3. Upload guided label file
    const guidedInput = page.locator('#input-guided-label');
    await guidedInput.setInputFiles(GUIDED_LABEL_PATH);

    // Verify badge shows filename
    await expect(page.locator('#block-guided-label')).toContainText('label_20260814_082555_A02.csv');

    // 4. Test missing dimension validation: add a third dimension that is not in the CSV
    await page.click('button[title="Add dimension"]');

    // Upload required data to enable start button
    await page.click('#block-gameplay');
    await page.waitForSelector('h3:text("Upload Gameplay Media")');
    await page.locator('#input-gameplay').setInputFiles(FRAME_PATHS);
    await page.locator('#input-telemetry').setInputFiles(CSV_PATH);
    await page.locator('#input-audio').setInputFiles(AUDIO_PATH);

    // Attempt start - should be blocked by missing dimension validation
    await page.click('#btn-start-session');
    await expect(page.locator('text=Guided label file is missing required dimension column')).toBeVisible();

    // Remove the extra dimension
    const removeBtns = page.locator('button[title="Remove dimension"]');
    await removeBtns.last().click();

    // Now start should succeed
    await page.click('#btn-start-session');
    await page.waitForTimeout(500);

    // Verify in session view: Guide indicator is visible in Score Timeline
    await expect(page.locator('text=Guide')).toBeVisible();
    console.log('✅ E2E: guided label upload → validation → session view with Guide indicator PASSED');
  });
});

