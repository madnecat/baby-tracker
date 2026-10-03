// Every file in ./en and ./fr is one area's messages (a flat { 'area.key': 'text' } object).
// They are merged here so adding an area is just adding a file in each folder — no index to edit.
const merge = (modules) => Object.assign({}, ...Object.values(modules).map((m) => m.default));

export const catalogs = {
  en: merge(import.meta.glob('./en/*.js', { eager: true })),
  fr: merge(import.meta.glob('./fr/*.js', { eager: true })),
};
