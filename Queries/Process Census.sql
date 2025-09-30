load spatial;

create or replace temp table census as
from st_read('CA_blocks/tl_2024_06_tabblock20.shp') as census
    cross join st_read('Santa_Rosa_High_Boundary.geojson') as HS_Boundary
    cross join st_read('Santa_Rosa_Elementary_Boundary.geojson') as ES_Boundary
select
    census.*,
    HS_Boundary.geom as HS_Boundary,
    ES_Boundary.geom as ES_Boundary
where
    st_intersects(census.geom, HS_Boundary.geom)
;

create or replace temp table secondary as
from census
select
    census.* exclude (geom, HS_boundary, ES_boundary),
    st_area(st_difference(st_intersection(census.geom, HS_boundary), ES_boundary)) / (ALAND20 + AWATER20) * 1e10 as area_pct,
    st_difference(st_intersection(census.geom, HS_boundary), ES_boundary) as geom
where
    area_pct >= 0.05
;

create or replace temp table elementary as
from census
select
    census.* exclude (HS_boundary, ES_boundary),
where
    census.GEOID20 not in (select GEOID20 from secondary)
;

create temp table srcs as
from secondary select * exclude (geom, area_pct), 'Secondary' as District, '#EEB612' as fill, geom
union
from elementary select * exclude (geom), 'Elementary' as District, '#49176D' as fill, geom
;

create or replace temp table combined as
from srcs
    join srcs as other on srcs.GEOID20 = other.GEOID20 and srcs.District <> other.District and st_area(srcs.geom) > st_area(other.geom)
select
    srcs.* exclude(geom),
    st_union(srcs.geom, other.geom) as geom
order by srcs.GEOID20
;

create or replace temp table final as
from srcs where srcs.GEOID20 not in (select GEOID20 from combined)
union
from combined
;

copy (
    from final where (st_area(geom)) / (ALAND20 + AWATER20) * 1e10 > 0.05
) to 'General/SRCS_Census_Blocks.geojson' (format gdal, driver 'geojson');