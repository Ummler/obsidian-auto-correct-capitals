# Obsidian AutoCorrect Plugin

This plugin automatically fixes common capitalization errors in your Obsidian notes. It specifically targets words where the first two letters are mistakenly capitalized (e.g., `HAllo` instead of `Hallo`) and corrects them. Additionally, new features ensure that list items are formatted correctly and that both codeblocks and math expressions (LaTeX) are protected from auto-correction.

## Features

- **Automatic Correction**  
  The plugin detects words where the first two letters are uppercase and the third letter is lowercase, automatically correcting them (e.g., `HAllo` → `Hallo`).

- **Exclusion List**  
  You can specify a list of words (comma separated) that should be excluded from any corrections.

- **Abbreviation List**
  This allows you to define common abbreviations (like `e.g.`, `i.e.`, or `etc.`) that the plugin recognizes. When these abbreviations are used, they prevent the plugin from mistakenly capitalizing words immediately following them, ensuring correct capitalization after abbreviations in your sentences.

- **Optimize List Items**  
  When the "Capitalize First Letter in List" option is enabled, any line starting with `- ` or `1. ` will have the first letter of the following word automatically capitalized.  
  **Example:**  
  - Before:  
    ```
    - hallo
    ```  
  - After:  
    ```
    - Hallo
    ```  
  Additionally, if a list item is incorrectly capitalized (e.g., `- HAllo`), the plugin will correct it to `- Hallo`.

- **Codeblock Protection**  
  The plugin detects fenced codeblocks and inline code (using backticks) and skips any corrections within these areas.

- **Mathblock Protection**  
  The plugin detects LaTeX math expressions – both inline (delimited by `$...$`) and block math (delimited by `$$...$$`) – and leaves them unchanged. This prevents auto-correction of mathematical notations.

- **YAML Front-matter Protection**
  The plugin also detects the YAML Frontmatter and wont correct inside it. 

- **Trigger on Various Characters**  
  Corrections are triggered by specific punctuation characters (e.g., space, period, comma, etc.) or by pressing Enter. When Enter is pressed, the plugin checks the previous line for corrections (even in lists or quotes).

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

The plugin provides three main settings:

- **Exclusion List**  
  Enter words (comma separated) that should be excluded from any auto-correction.

- **Capitalize First Letter in List**  
  When enabled, any list item (lines starting with `- `or 'x. ' where x is a number) will have the first letter of the following word capitalized.  
  **Example:**  
  - Before: `- hallo`  
  - After: `- Hallo`  
  Also, if a word such as `- HAllo` is detected, it will be corrected to `- Hallo`.

- **Capitalize Sentence Beginnings**  
  When enabled, the first letter of the last sentence in a line will be capitalized if it was typed in lowercase.

