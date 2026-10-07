// @ts-check

/**
 * @namespace Fl32_Cms_Back_Cli_Command_Export
 * @description Exports a complete static site into dist/.
 */
export default class Export {
    /**
     * @param {object} deps
     * @param {Fl32_Cms_Back_Publication_StaticExporter} deps.exporter
     */
    constructor({exporter}) {
        this.id = 'cms:export';
        this.summary = 'Export Markdown publications and public assets as a static site.';
        this.lifetime = 'finite';
        /** @returns {Promise<void>} */
        this.execute = async () => {
            await exporter.export();
        };
    }
}

export const __deps__ = Object.freeze({
    default: Object.freeze({exporter: 'Fl32_Cms_Back_Publication_StaticExporter$'}),
});
