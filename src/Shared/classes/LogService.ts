export class LogService {
	private static partial = false;

	static write(message: string) {
		this.partial = !message.endsWith("\n");
		process.stdout.write(message);
	}

	static writeLine(message: string) {
		if (this.partial) {
			this.write("\n");
		}
		this.write(message + "\n");
	}
}
