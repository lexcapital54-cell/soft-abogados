import {
  buildCaseFolderPath,
  sanitizeFileName,
  sanitizeFolderName,
} from './sanitize-folder-name';

describe('sanitizeFolderName', () => {
  it('limpia pipes, paréntesis y números sueltos', () => {
    expect(
      sanitizeFolderName('LUIS HERNANDO URQUIJO QUEVEDO | 2691080 (2)'),
    ).toBe('LUIS_HERNANDO_URQUIJO_QUEVEDO');
  });

  it('normaliza espacios a underscore y mayúsculas', () => {
    expect(sanitizeFolderName('ana maria  henao')).toBe('ANA_MARIA_HENAO');
  });
});

describe('buildCaseFolderPath', () => {
  it('arma la ruta de negocio', () => {
    expect(
      buildCaseFolderPath(
        '2691080',
        'LUIS HERNANDO URQUIJO QUEVEDO | 2691080 (2)',
      ),
    ).toBe('casos/2691080_LUIS_HERNANDO_URQUIJO_QUEVEDO');
  });
});

describe('sanitizeFileName', () => {
  it('normaliza el nombre del archivo', () => {
    expect(sanitizeFileName('Registro Civil Ana.pdf')).toBe(
      'registro_civil_ana.pdf',
    );
  });
});
