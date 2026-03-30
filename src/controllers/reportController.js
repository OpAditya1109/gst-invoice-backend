import ExcelJS from 'exceljs';
import Invoice from '../models/Invoice.js';

export const downloadGSTReport = async (req, res) => {
  try {
    const invoices = await Invoice.find();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('GST Report');

    // Columns
    sheet.columns = [
      { header: 'Invoice No', key: 'invoiceNumber', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Party Name', key: 'vendor', width: 25 },
      { header: 'GSTIN', key: 'gstin', width: 20 },
      { header: 'Taxable Value', key: 'taxable', width: 15 },
      { header: 'CGST', key: 'cgst', width: 10 },
      { header: 'SGST', key: 'sgst', width: 10 },
      { header: 'IGST', key: 'igst', width: 10 },
      { header: 'Total Amount', key: 'total', width: 15 },
      { header: 'Place of Supply', key: 'place', width: 20 },
    ];

    invoices.forEach((inv) => {
      sheet.addRow({
        invoiceNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        vendor: inv.vendorName,
        gstin: inv.gstin,
        taxable: inv.taxableAmount || 0,
        cgst: inv.cgst || 0,
        sgst: inv.sgst || 0,
        igst: inv.igst || 0,
        total: inv.totalAmount,
        place: inv.placeOfSupply || '',
      });
    });

    // Styling header
    sheet.getRow(1).font = { bold: true };

    // Response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename=GST_Report.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error generating report' });
  }
};