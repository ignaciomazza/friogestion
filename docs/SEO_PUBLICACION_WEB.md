# SEO y publicacion web de productos

El SEO de publicaciones storefront se resuelve primero con datos reales del producto y de la publicacion web. Los campos manuales existen solo para hacer overrides editoriales puntuales, no para cargar SEO artificial.

## Campos reales de publicacion

- `seoTitle`: override opcional del titulo SEO.
- `metaDescription`: override opcional de la descripcion SEO.
- `slug`: URL legible de la publicacion, unica por canal.
- `indexable`: control editorial para permitir o evitar indexacion.
- `images[].alt`: texto alternativo individual por imagen.

## SEO automatico

El titulo SEO final se calcula asi:

1. Usa `seoTitle` si esta completo.
2. Si no, usa el nombre publico.
3. Agrega marca, modelo y categoria cuando existan y no dupliquen palabras.
4. No inventa capacidad, eficiencia, garantia, origen ni otros datos.
5. Mantiene el texto acotado para evitar titulos largos o roboticos.

La meta description final se calcula asi:

1. Usa `metaDescription` si esta completa.
2. Si no, usa la descripcion corta.
3. Si no, resume la descripcion larga.
4. Si no hay descripcion, arma una frase simple con nombre publico, categoria, marca y modelo.
5. No usa keyword stuffing ni meta keywords.

La prioridad para sitemap/catalogo es calculada, no editable. Usa senales como publicacion activa, producto destacado, stock disponible, descripcion corta, descripcion larga, imagenes, ficha tecnica y ventas confirmadas cuando existen.

## Prioridad de carga

1. Nombre publico claro y buscable.
2. Categoria correcta.
3. Marca y modelo en los datos generales del producto.
4. Descripcion corta util.
5. Descripcion larga con informacion real de uso, compatibilidad o alcance.
6. Imagenes reales del producto con `alt` descriptivo.
7. Ficha tecnica para atributos variables como capacidad, eficiencia, garantia, origen, linea, tension o medidas.
8. Slug corto, legible y estable.
9. `seoTitle` y `metaDescription` solo cuando haga falta mejorar el resultado automatico.
10. `indexable` activo solo para publicaciones que deben posicionar.

## Reglas de carga

- No inventar marca, modelo, capacidad, eficiencia, garantia, origen ni atributos tecnicos.
- No usar titulos genericos como "Producto 123", "Aire acondicionado", "Repuesto" o "Articulo".
- No usar `relatedTerms` como meta keywords. Ese campo no forma parte del modelo SEO.
- No cargar SEO artificial para compensar productos incompletos; completar primero los datos reales.
- No cambiar slugs existentes salvo que sea necesario y coordinado con la web.

## Categorias futuras

Hoy las categorias de la tienda son strings configurables por canal. Para esta etapa no se refactorizan. A futuro puede convenir una entidad de categorias web con `nombre`, `slug`, descripcion corta, descripcion larga, meta title, meta description, `indexable` y prioridad calculada, evitando crear paginas masivas o contenido duplicado por categoria.
