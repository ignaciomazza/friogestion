# SEO y publicacion web de productos

Los datos SEO viven en la publicacion web (`StorefrontPublication`), no en el producto interno (`Product`). Esto permite mantener el catalogo operativo sin obligar a completar datos publicos en altas rapidas, compras o stock.

## Campos opcionales

- `seoTitle`: titulo publico sugerido para buscadores y asistentes.
- `metaDescription`: descripcion breve para resultados de busqueda.
- `slug`: URL legible de la publicacion, unica por canal.
- `subcategory`: subcategoria publica simple.
- `productType`: tipo de producto real.
- `capacity`: capacidad real cargada por el admin.
- `energyEfficiency`: eficiencia energetica real, si aplica.
- `warranty`: garantia real comunicable.
- `origin`: origen, linea o familia comercial real.
- `relatedTerms`: terminos internos para contexto y busqueda; no son meta keywords.
- `indexable`: indica si la web deberia permitir indexacion.
- `priority`: prioridad sugerida para sitemap, entre `0` y `1`.
- `images[].alt`: texto alternativo individual por imagen.

## Prioridad de carga

1. Completar `seoTitle` con marca, modelo, tipo y capacidad cuando esos datos existan.
2. Completar `metaDescription` con una frase util basada en descripcion real.
3. Revisar que el `slug` sea corto, legible y estable.
4. Mantener `indexable` activo solo si el producto deberia posicionar.
5. Ajustar `priority` para destacar productos estrategicos sin abusar del valor alto.
6. Completar `subcategory`, `productType`, `capacity` y `warranty` cuando corresponda.
7. Cargar `alt` en cada imagen describiendo la imagen real.
8. Usar `relatedTerms` solo como apoyo interno de busqueda/contexto.

## Reglas de carga

- No inventar marca, modelo, capacidad, eficiencia, garantia ni origen.
- No usar titulos genericos como "Producto 123", "Aire acondicionado", "Repuesto" o "Articulo".
- No usar `relatedTerms` como meta keywords ni cargar listas masivas.
- No cambiar slugs existentes salvo que sea necesario y coordinado con la web.
- Si una categoria necesita contenido propio, conviene modelarla en el futuro como categoria web con `nombre`, `slug`, descripciones, `metaTitle`, `metaDescription`, `indexable` y `priority`.

## Categorias futuras

Hoy las categorias de la tienda son strings configurables por canal. Para esta etapa no se refactorizan. A futuro puede convenir una entidad de categorias web, pero evitando crear paginas masivas o contenido duplicado por categoria.
