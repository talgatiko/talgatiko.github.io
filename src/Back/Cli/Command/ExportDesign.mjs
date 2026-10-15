// @ts-check
/** Local-only editorial preview through the existing static exporter. */
export default class ExportDesign {
    /** @param {{exporter: Fl32_Cms_Back_Publication_StaticExporter}} deps */
    constructor({exporter}) {
        this.id = 'cms:export-design';
        this.summary = 'Build the editorial design preview in design-preview/.';
        this.lifetime = 'finite';
        this.execute = async () => { await exporter.export({designPreview: true}); };
    }
}
export const __deps__ = Object.freeze({default: Object.freeze({exporter: 'Fl32_Cms_Back_Publication_StaticExporter$'})});
