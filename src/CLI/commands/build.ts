import ts from "byots";
import chokidar from "chokidar";
import { CLIError } from "CLI/errors/CLIError";
import fs from "fs-extra";
import path from "path";
import { Project, ProjectOptions } from "Project";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import yargs from "yargs";

function getTsConfigProjectOptions(tsConfigPath?: string): Partial<ProjectOptions> | undefined {
	if (tsConfigPath !== undefined) {
		const rawJson = ts.sys.readFile(tsConfigPath);
		if (rawJson !== undefined) {
			return ts.parseConfigFileTextToJson(tsConfigPath, rawJson).config.rbxts;
		}
	}
}

interface CLIOptions {
	project: string;
	watch: boolean;
	verbose: boolean;
}

const CHOKIDAR_OPTIONS: chokidar.WatchOptions = {
	awaitWriteFinish: {
		pollInterval: 10,
		stabilityThreshold: 50,
	},
	ignoreInitial: true,
	ignorePermissionErrors: true,
};

function handleErrors(callback: () => void) {
	try {
		callback();
	} catch (e) {
		// catch recognized errors
		if (e instanceof ProjectError || e instanceof DiagnosticError) {
			e.log();
		} else {
			throw e;
		}
	}
}

/**
 * Defines the behavior for the `rbxtsc build` command.
 */
export = ts.identity<yargs.CommandModule<{}, Partial<ProjectOptions> & CLIOptions>>({
	command: ["$0", "build"],

	describe: "Build a project",

	builder: () =>
		yargs
			.option("project", {
				alias: "p",
				string: true,
				default: ".",
				describe: "project path",
			})
			.option("watch", {
				alias: "w",
				boolean: true,
				default: false,
				describe: "enable watch mode",
			})
			.option("verbose", {
				boolean: true,
				default: false,
				describe: "enable verbose logs",
			})
			// DO NOT PROVIDE DEFAULTS BELOW HERE, USE DEFAULT_PROJECT_OPTIONS
			.option("includePath", {
				alias: "i",
				string: true,
				describe: "folder to copy runtime files to",
			})
			.option("rojo", {
				string: true,
				describe: "Manually select Rojo configuration file",
			}),

	handler: async argv => {
		// attempt to retrieve TypeScript configuration JSON path
		let tsConfigPath: string | undefined = path.resolve(argv.project);
		if (!fs.existsSync(tsConfigPath) || !fs.statSync(tsConfigPath).isFile()) {
			tsConfigPath = ts.findConfigFile(tsConfigPath, ts.sys.fileExists);
			if (tsConfigPath === undefined) {
				throw new CLIError("Unable to find tsconfig.json!");
			}
		}
		tsConfigPath = path.resolve(process.cwd(), tsConfigPath);

		// parse the contents of the retrieved JSON path as a partial `ProjectOptions`
		const tsConfigProjectOptions = getTsConfigProjectOptions(tsConfigPath);
		const projectOptions: Partial<ProjectOptions> = Object.assign({}, tsConfigProjectOptions, argv);

		handleErrors(() => {
			const project = new Project(tsConfigPath!, projectOptions, argv.verbose);
			if (argv.watch) {
				let isBuilding = false;
				let buildPending = false;

				function build() {
					if (isBuilding) {
						buildPending = true;
						return;
					}

					isBuilding = true;
					buildPending = false;
					handleErrors(() => {
						project.reloadProgram();
						project.cleanup();
						project.compileAll();
					});
					isBuilding = false;
				}

				chokidar.watch(project.getRootDirs(), CHOKIDAR_OPTIONS).on("all", () => build());
				build();
			} else {
				project.cleanup();
				project.compileAll();
			}
		});
	},
});
