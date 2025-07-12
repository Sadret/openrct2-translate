import $ from "jquery";

export type Data = {
  language: string;
  issueNumber: string;
  strings: {
    key: string;
    original: string;
    translated: string;
  }[];
};

export function getData(): Data {
  const language = $("#th-lang").text();
  const issueNumber = $("#issue-id").text();
  const strings = [...$("#translate-strings tbody tr")].map(row => {
    const key = $(row).find(".strId").text();
    const original = $(row).find(".original").text();
    const translated = $(row).find(".translated").text();
    return { key, original, translated };
  });
  return { language, issueNumber, strings };
}

export function setData(data: Data) {
  $("#th-lang").text(data.language);
  $("#translate-strings tbody").empty();
  for (const { key, original, translated } of data.strings) {
    $("<tr>").append(
      $("<td>").addClass("strId").text(key),
      $("<td>").addClass("original").text(original),
      $("<td>").append($("<button>").text(">").on("click", function () { $(this).parent().next().text($(this).parent().prev().text()); })),
      $("<td>").addClass("translated").attr("contenteditable", "true").text(translated),
    ).appendTo("#translate-strings tbody");
  }
}

export function storeData(data: Data) {
  localStorage.setItem("data", JSON.stringify(data));
}

export function loadData(): Data | null {
  return JSON.parse(localStorage.getItem("data") || "null");
}