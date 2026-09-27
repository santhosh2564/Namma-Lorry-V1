import { promises as fs } from "fs";
import * as path from "path";

import type { ConfigPlugin } from "expo/config-plugins";
import {
  createRunOncePlugin,
  IOSConfig,
  withDangerousMod,
  withPodfile,
  withProjectBuildGradle,
  withXcodeProject,
} from "expo/config-plugins";

/**
 * Local Expo config plugin for `mappls-map-react-native` (M3, R1).
 *
 * The plugin shipped inside the package is broken: `app.plugin.js` requires
 * `./plugin/build/withMappls`, but no `plugin/` directory is published (verified
 * against mappls-map-react-native@2.0.3). This plugin applies the same native
 * changes during `expo prebuild`, so `android/` and `ios/` stay generated and
 * are never committed.
 *
 * What it changes (per the official install docs, docs/v2.0.1/Add-Mappls-SDK.md):
 *
 *  Android
 *  1. Adds the Mappls maven repository to the root `android/build.gradle`
 *     (`allprojects.repositories`). The docs point at `settings.gradle`'s
 *     `dependencyResolutionManagement`, but Expo's generated `settings.gradle`
 *     has no repositories block, so the root Gradle file is the correct place.
 *  2. Copies `<appId>.a.olf` + `<appId>.a.conf` into `android/app/`. The
 *     package's own `react-mappls-plugin.gradle` searches the app module
 *     directory (and its variants) and turns them into `mappls_olf_data` +
 *     `assets/mappls-conf.txt` at build time.
 *
 *  iOS
 *  3. Inserts `$MAPPLS_MAPS.post_install(installer)` into the Podfile's
 *     `post_install` block (the podspec defines `$MAPPLS_MAPS`).
 *  4. Copies `<appId>.i.olf` + `<appId>.i.conf` into the app target and adds
 *     them to its Copy Bundle Resources build phase.
 *
 * Credential files are licensing material tied to a package name / bundle id
 * and signing certificate. They are downloaded from the Mappls console
 * (https://auth.mappls.com/console) and must never be committed — the
 * `mappls/` folder is gitignored. Lay them out as:
 *
 *   mappls/android/<appId>.a.olf   mappls/android/<appId>.a.conf
 *   mappls/ios/<appId>.i.olf       mappls/ios/<appId>.i.conf
 *
 * If the files are absent the plugin warns instead of throwing, so web-only
 * work, typechecking and CI keep working. A native prebuild then fails inside
 * Gradle / CocoaPods with the SDK's own "no .a.olf file found" error until the
 * files are added.
 */

const MAPPLS_MAVEN_REPO = "https://maven.mappls.com/repository/mappls/";
const MAPPLS_POST_INSTALL = "$MAPPLS_MAPS.post_install(installer)";
const ANDROID_OLF_SUFFIX = ".a.olf";
const ANDROID_CONF_SUFFIX = ".a.conf";
const IOS_OLF_SUFFIX = ".i.olf";
const IOS_CONF_SUFFIX = ".i.conf";
const DEFAULT_CONFIG_DIR = "mappls";

export type WithMapplsProps = {
  /**
   * Folder (relative to the project root) that holds the Mappls credential
   * files. Defaults to `mappls`.
   */
  configDir?: string;
};

function warn(message: string): void {
  console.warn(`[withMappls] ${message}`);
}

/** Adds the Mappls maven repository to the root build.gradle, once. */
function addMapplsMavenRepository(contents: string, language: "groovy" | "kt"): string {
  if (contents.includes("maven.mappls.com")) {
    return contents;
  }

  const line =
    language === "kt"
      ? `    maven(url = "${MAPPLS_MAVEN_REPO}")`
      : `    maven { url '${MAPPLS_MAVEN_REPO}' }`;

  if (!/allprojects\s*\{\s*repositories\s*\{/.test(contents)) {
    warn("could not find `allprojects { repositories {` in android/build.gradle");
    return contents;
  }

  return contents.replace(/(allprojects\s*\{\s*repositories\s*\{)/, (match) => `${match}\n${line}`);
}

/** Adds `$MAPPLS_MAPS.post_install(installer)` to the Podfile post_install block, once. */
function addMapplsPostInstall(contents: string): string {
  if (contents.includes(MAPPLS_POST_INSTALL)) {
    return contents;
  }

  const anchor = "post_install do |installer|";
  const index = contents.indexOf(anchor);
  if (index === -1) {
    warn("could not find `post_install do |installer|` in ios/Podfile");
    return contents;
  }

  const insertAt = index + anchor.length;
  return `${contents.slice(0, insertAt)}\n    ${MAPPLS_POST_INSTALL}${contents.slice(insertAt)}`;
}

/** Returns the first file in `dir` ending with `suffix`, or null. */
async function findBySuffix(dir: string, suffix: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const match = entries.find((entry) => entry.endsWith(suffix));
  return match ? path.join(dir, match) : null;
}

const withMappls: ConfigPlugin<WithMapplsProps | void> = (config, props) => {
  const configDirRelative = props?.configDir ?? DEFAULT_CONFIG_DIR;

  // 1. Android maven repository.
  config = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language === "groovy" || cfg.modResults.language === "kt") {
      cfg.modResults.contents = addMapplsMavenRepository(
        cfg.modResults.contents,
        cfg.modResults.language,
      );
    }
    return cfg;
  });

  // 2. Android credential files → android/app/.
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const sourceDir = path.join(projectRoot, configDirRelative, "android");
      const destinationDir = path.join(cfg.modRequest.platformProjectRoot, "app");
      await fs.mkdir(destinationDir, { recursive: true });

      for (const suffix of [ANDROID_OLF_SUFFIX, ANDROID_CONF_SUFFIX]) {
        const source = await findBySuffix(sourceDir, suffix);
        if (!source) {
          warn(
            `missing ${suffix} file in ${path.relative(projectRoot, sourceDir)} — ` +
              `download it from the Mappls console and place it there`,
          );
          continue;
        }
        await fs.copyFile(source, path.join(destinationDir, path.basename(source)));
      }
      return cfg;
    },
  ]);

  // 3. iOS Podfile post_install hook.
  config = withPodfile(config, (cfg) => {
    cfg.modResults.contents = addMapplsPostInstall(cfg.modResults.contents);
    return cfg;
  });

  // 4. iOS credential files → app target + Copy Bundle Resources.
  config = withXcodeProject(config, async (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const platformRoot = cfg.modRequest.platformProjectRoot;
    const sourceDir = path.join(projectRoot, configDirRelative, "ios");
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const destinationDir = path.join(platformRoot, projectName);
    const target = IOSConfig.XcodeUtils.getApplicationNativeTarget({
      project: cfg.modResults,
      projectName,
    });

    for (const suffix of [IOS_OLF_SUFFIX, IOS_CONF_SUFFIX]) {
      const source = await findBySuffix(sourceDir, suffix);
      if (!source) {
        warn(
          `missing ${suffix} file in ${path.relative(projectRoot, sourceDir)} — ` +
            `download it from the Mappls console and place it there`,
        );
        continue;
      }

      await fs.mkdir(destinationDir, { recursive: true });
      const destination = path.join(destinationDir, path.basename(source));
      await fs.copyFile(source, destination);

      IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath: path.relative(platformRoot, destination),
        groupName: projectName,
        project: cfg.modResults,
        isBuildFile: true,
        verbose: false,
        targetUuid: target.uuid,
      });
    }

    return cfg;
  });

  return config;
};

export default createRunOncePlugin(withMappls, "withMappls", "1.0.0");
