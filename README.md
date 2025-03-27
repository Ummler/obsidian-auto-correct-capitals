
# Obsidian AutoCorrect Plugin

This plugin automatically fixes common capitalization errors in your Obsidian notes. It specifically targets words where the first two letters are mistakenly capitalized (e.g., `HAllo` instead of `Hallo`) and corrects them. In addition, a new feature ensures that for list items, the first letter of the first word is always capitalized.

## Features

- **Automatic Correction**  
  The plugin detects words where the first two letters are uppercase and the third letter is lowercase, and it automatically corrects them (e.g., `HAllo` → `Hallo`).

- **Exclusion List**  
  You can specify a list of words (separated by commas) that should be excluded from any corrections.

- **Optimize List Items**  
  When the "Capitalize First Letter in List" option is enabled, any line that begins with `- ` will have the first letter of the following word capitalized.  
  **Example:**  
  - Before:  
    ```
    - hallo
    ```
  - After:  
    ```
    - Hallo
    ```
  In addition, if the word is incorrectly capitalized (e.g., `- HAllo`), the plugin will also correct the second letter to lowercase.

- **Codeblock Protection**  
  No changes are made within codeblocks (either fenced or inline).

- **Trigger on Various Characters**  
  Corrections are triggered by specific punctuation characters or by pressing Enter. When Enter is pressed, the plugin checks the previous line for correction even in lists or quotes.

## Installation

### Through Obsidian Community Plugins

1. Open **Settings** > **Community Plugins** in Obsidian.
2. Search for "Obsidian AutoCorrect Plugin" and install it.
3. Enable the plugin.

### Manual Installation

1. Clone or download the repository.
2. Place the plugin folder in your vault under `.obsidian/plugins/obsidian-auto-correct`.
3. Restart Obsidian and enable the plugin from the Community Plugins section.

## Configuration

The plugin provides two main settings:

- **Exclusion List**  
  Add words (separated by commas) here that should not be corrected.

- **Capitalize First Letter in List**  
  Enable this option to ensure that, in list items (lines starting with `- `), the first letter of the first word is automatically capitalized.  
  **Example:**  
  - Before: `- hallo`  
  - After: `- Hallo`  
  Also, if a word like `- HAllo` is detected, the plugin corrects it to `- Hallo`.

## Usage

### Standard Auto-Correction

- **Example:**  
  Type `HAllo` in a regular line and then enter a trigger character (such as a space or punctuation) or press Enter.  
  **Result:** `Hallo`

### List Items

- **Example 1 (Lowercase Start):**  
  **Before:**  
  ```
  - hallo
  ```  
  **After:**  
  ```
  - Hallo
  ```

- **Example 2 (Incorrect Capitalization):**  
  **Before:**  
  ```
  - HAllo
  ```  
  **After:**  
  ```
  - Hallo
  ```

### Codeblocks

Words within codeblocks (fenced or inline using backticks) are not altered.

````
```
HAllo // remains unchanged
```
````