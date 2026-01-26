import UrlTableBrowser from '../../../../../components/table-browser/url-table-browser';

type CatalogTablePageProps = {
    team: string;
    connectionId: string;
    catalog: string;
    database: string;
    table: string;
};

export default async function CatalogTablePage({ params }: { params: Promise<CatalogTablePageProps> }) {
    console.log('CatalogTablePage render', { params });
    const { catalog, database, table } = await params;

    return <UrlTableBrowser catalog={catalog} databaseName={database} tableName={table} />;
}
